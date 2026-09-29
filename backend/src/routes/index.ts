/**
 * STANDARD BUILD — route aggregator. Each domain lives in its own module.
 * Old monolithic memoryDb implementation removed.
 */
import { Router } from 'express';
import { authGate } from '../middleware/publicRoutes.js';
import { authRouter } from './auth.js';
import { usersRouter } from './users.js';
import { patientsRouter } from './patients.js';
import { requestsRouter } from './requests.js';
import { imagesRouter } from './images.js';
import { reportsRouter } from './reports.js';
import { pricingRouter } from './pricing.js';
import { systemRouter } from './system.js';
import { portalRouter } from './portal.js';
import { storageRouter } from './storage.js';
import { aiRouter } from './ai.js';
import { docsRouter } from './docs.js';

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
