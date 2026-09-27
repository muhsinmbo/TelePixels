/**
 * STANDARD BUILD — route aggregator. Each domain lives in its own module.
 * Old monolithic memoryDb implementation removed.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { patientsRouter } from './patients';
import { requestsRouter } from './requests';
import { imagesRouter } from './images';
import { reportsRouter } from './reports';
import { pricingRouter } from './pricing';
import { systemRouter } from './system';
import { portalRouter } from './portal';
import { storageRouter } from './storage';

export const backendRouter = Router();

// Single auth choke point. Everything needs JWT except these two public routes.
// (Per-router `router.use(requireAuth)` is banned: Express runs router middleware
// for every request passing through, which 401s public routes mounted later.)
const PUBLIC = new Set(['POST /auth/login', 'POST /portal/verify', 'GET /settings/global']);
backendRouter.use((req, res, next) => {
  if (PUBLIC.has(`${req.method} ${req.path}`)) return next();
  return requireAuth(req, res, next);
});

backendRouter.use(authRouter);
backendRouter.use(usersRouter);
backendRouter.use(patientsRouter);
backendRouter.use(requestsRouter);
backendRouter.use(imagesRouter);
backendRouter.use(reportsRouter);
backendRouter.use(pricingRouter);
backendRouter.use(systemRouter);
backendRouter.use(portalRouter);
backendRouter.use(storageRouter);
