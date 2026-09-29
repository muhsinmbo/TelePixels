/**
 * Real auth: bcrypt password check + short-lived JWT + rotating refresh tokens.
 * Rotation: each refresh revokes the old token; reusing a rotated token
 * revokes the whole chain (theft detection). Only SHA-256 hashes are stored.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { dbQuery } from '../database/db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { audit, ah } from '../middleware/errors.js';

export const authRouter = Router();

const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function profileOf(user: any) {
  return {
    uid: user.id, id: user.id, email: user.email, displayName: user.display_name,
    role: user.role, status: user.status, facilityId: user.facility_id,
    systemTheme: user.system_theme,
  };
}

async function issuePair(user: any) {
  const token = signToken({ id: user.id, email: user.email, role: user.role, facilityId: user.facility_id });
  const refreshToken = 'rt_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 3600 * 1000);
  await dbQuery(
    `INSERT INTO refresh_tokens (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`,
    [hashToken(refreshToken), user.id, expiresAt.toISOString()]
  );
  return { token, refreshToken };
}

authRouter.post('/auth/login', authLimiter, ah(async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const rows = await dbQuery<any>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const pair = await issuePair(user);
  await audit(req, 'LOGIN', `User ${user.display_name} logged in`, user.id);
  res.json({ ...pair, user: profileOf(user) });
}));

authRouter.get('/auth/me', requireAuth, ah(async (req: Request, res: Response) => {
  const rows = await dbQuery<any>('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  const user = rows[0];
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Unauthenticated' });
  res.json(profileOf(user));
}));

/** Exchange a refresh token for a fresh pair (old token dies immediately). */
authRouter.post('/auth/refresh', authLimiter, ah(async (req: Request, res: Response) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  const hash = hashToken(refreshToken);
  const rows = await dbQuery<any>('SELECT * FROM refresh_tokens WHERE token_hash = $1', [hash]);
  const stored = rows[0];
  if (!stored) return res.status(401).json({ error: 'Invalid refresh token' });
  if (stored.revoked_at || new Date(stored.expires_at) < new Date()) {
    // Reuse of a dead token = possible theft: burn the whole chain.
    await dbQuery(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [stored.user_id]);
    await audit(req, 'AUTH_THEFT_LOCKDOWN', `Refresh reuse detected for user ${stored.user_id}`, stored.user_id);
    return res.status(401).json({ error: 'Session revoked — please log in again' });
  }
  const users = await dbQuery<any>('SELECT * FROM users WHERE id = $1', [stored.user_id]);
  const user = users[0];
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Unauthenticated' });
  const pair = await issuePair(user);
  await dbQuery(
    `UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $1 WHERE token_hash = $2`,
    [hashToken(pair.refreshToken), hash]
  );
  res.json({ ...pair, user: profileOf(user) });
}));

/** Revoke one session (body refreshToken) or every session (body all: true). */
authRouter.post('/auth/revoke', requireAuth, ah(async (req: Request, res: Response) => {
  const { refreshToken, all } = req.body || {};
  if (all) {
    await dbQuery(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [req.user!.id]);
  } else if (refreshToken) {
    await dbQuery(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND user_id = $2`,
      [hashToken(refreshToken), req.user!.id]);
  }
  await audit(req, 'LOGOUT', all ? 'User revoked all sessions' : 'User logged out');
  res.json({ success: true });
}));

authRouter.post('/auth/logout', requireAuth, ah(async (req: Request, res: Response) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    await dbQuery(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND user_id = $2`,
      [hashToken(refreshToken), req.user!.id]);
  }
  await audit(req, 'LOGOUT', 'User logged out');
  res.json({ success: true }); // client also discards the access token
}));
