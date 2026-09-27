/**
 * Real auth: bcrypt password check + JWT. No bypasses.
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { dbQuery } from '../database/db';
import { signToken, requireAuth } from '../middleware/auth';
import { audit } from '../middleware/errors';

export const authRouter = Router();

authRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const rows = await dbQuery<any>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken({ id: user.id, email: user.email, role: user.role, facilityId: user.facility_id });
  await audit(req, 'LOGIN', `User ${user.display_name} logged in`, user.id);
  res.json({
    token,
    user: {
      uid: user.id, id: user.id, email: user.email, displayName: user.display_name,
      role: user.role, status: user.status, facilityId: user.facility_id,
      systemTheme: user.system_theme,
    },
  });
});

authRouter.get('/auth/me', requireAuth, async (req: Request, res: Response) => {
  const rows = await dbQuery<any>('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  const user = rows[0];
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Unauthenticated' });
  res.json({
    uid: user.id, id: user.id, email: user.email, displayName: user.display_name,
    role: user.role, status: user.status, facilityId: user.facility_id,
    systemTheme: user.system_theme,
  });
});

authRouter.post('/auth/logout', requireAuth, async (req: Request, res: Response) => {
  await audit(req, 'LOGOUT', 'User logged out');
  res.json({ success: true }); // stateless JWT: client discards token
});
