import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { createUrlsService } from './urls.service.js';
import { createUrlSchema, updateUrlSchema } from './urls.schemas.js';

// Mounted at /api/projects/:projectId/urls
export function urlsRouter({ prisma }) {
  const router = Router({ mergeParams: true });
  const service = createUrlsService(prisma);

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await service.list(req.params.projectId));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const input = createUrlSchema.parse(req.body ?? {});
    res.status(201).json(await service.create(req.params.projectId, input));
  }));

  router.patch('/:urlId', asyncHandler(async (req, res) => {
    const input = updateUrlSchema.parse(req.body ?? {});
    res.json(await service.update(req.params.projectId, req.params.urlId, input));
  }));

  router.delete('/:urlId', asyncHandler(async (req, res) => {
    await service.remove(req.params.projectId, req.params.urlId);
    res.status(204).end();
  }));

  return router;
}
