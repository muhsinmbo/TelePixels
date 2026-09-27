/**
 * Facility pricing: admins propose (pending), superadmin approves.
 */
import { Router, Request, Response } from 'express';
import { dbQuery } from '../database/db';
import { requireAuth, requireRole, facilityScope } from '../middleware/auth';
import { audit } from '../middleware/errors';

export const pricingRouter = Router();

pricingRouter.get('/facilities/:facilityId/pricing', async (req: Request, res: Response) => {
  const scope = facilityScope(req);
  if (scope && scope !== req.params.facilityId) return res.status(403).json({ error: 'Cross-facility access denied' });
  res.json(await dbQuery(
    `SELECT facility_id AS "facilityId", part_name AS "partName", price, pending_price AS "pendingPrice",
       currency, status, approved_by AS "approvedBy", approved_at AS "approvedAt", updated_at AS "updatedAt"
     FROM facility_pricing WHERE facility_id = $1 ORDER BY part_name`, [req.params.facilityId]));
});

pricingRouter.put('/facilities/:facilityId/pricing/:partName', requireRole('facilityadmin'), async (req: Request, res: Response) => {
  const scope = facilityScope(req);
  if (scope && scope !== req.params.facilityId) return res.status(403).json({ error: 'Cross-facility write denied' });
  const { price, pendingPrice, approve } = req.body || {};
  if (approve === true) {
    if (req.user!.role !== 'superadmin') return res.status(403).json({ error: 'Only superadmin can approve pricing' });
    const rows = await dbQuery<any>(
      `UPDATE facility_pricing SET price = COALESCE(pending_price, price), pending_price = NULL,
         status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE facility_id = $2 AND part_name = $3 RETURNING part_name AS "partName", price`,
      [req.user!.id, req.params.facilityId, req.params.partName]);
    if (!rows[0]) return res.status(404).json({ error: 'Pricing item not found' });
    await audit(req, 'PRICING_APPROVE', `Approved ${req.params.partName}`);
    return res.json(rows[0]);
  }
  const value = pendingPrice !== undefined ? pendingPrice : price;
  if (typeof value !== 'number' || value < 0) return res.status(400).json({ error: 'price/pendingPrice must be a non-negative number' });
  const rows = await dbQuery<any>(
    `INSERT INTO facility_pricing (facility_id, part_name, price, pending_price, currency, status)
     VALUES ($1,$2,$3,$3,'GHS','pending')
     ON CONFLICT (facility_id, part_name)
     DO UPDATE SET pending_price = EXCLUDED.pending_price, status = 'pending', updated_at = NOW()
     RETURNING part_name AS "partName", price, pending_price AS "pendingPrice", status`,
    [req.params.facilityId, req.params.partName, value]);
  await audit(req, 'PRICING_PROPOSE', `Proposed price for ${req.params.partName}: ${value}`);
  res.json(rows[0]);
});
