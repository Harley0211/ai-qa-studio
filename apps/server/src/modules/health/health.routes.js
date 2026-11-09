import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';

export function healthRouter({ prisma }) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      let database = 'ok';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        database = 'error';
      }
      const status = database === 'ok' ? 'ok' : 'degraded';
      res.status(database === 'ok' ? 200 : 503).json({ status, checks: { database } });
    }),
  );

  return router;
}
