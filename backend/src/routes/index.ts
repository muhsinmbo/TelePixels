/**
 * STANDARD BUILD — route aggregator. Each domain lives in its own module.
 * Old monolithic memoryDb implementation removed.
 */
import { Router } from 'express';
import { authGate } from '../middleware/publicRoutes';
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
import { aiRouter } from './ai';
import { docsRouter } from './docs';

export const backendRouter = Router();

// Single auth choke point (see middleware/publicRoutes.ts).
// (Per-router `router.use(requireAuth)` is banned: Express runs router middleware
// for every request passing through, which 401s public routes mounted later.)
backendRouter.use(authGate);

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
backendRouter.use(aiRouter);
backendRouter.use(docsRouter);
