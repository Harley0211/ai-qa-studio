import { afterAll, describe, expect, it } from 'vitest';
import { api, prisma } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('GET /api/health', () => {
  it('reports database connectivity', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  it('returns a JSON error envelope for unknown API routes', async () => {
    const res = await api().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects requests whose Host header is not a localhost address', async () => {
    const res = await api().get('/api/health').set('Host', 'evil.example.com');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_HOST');
  });
});
