import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createProject, prisma, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('POST /api/projects', () => {
  it('creates a project and trims input', async () => {
    const res = await api().post('/api/projects').send({ name: '  PNCC Website  ', description: ' Main site ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'PNCC Website', description: 'Main site', urlCount: 0, urls: [] });
    expect(res.body.id).toBeTruthy();
  });

  it('stores an empty description as null', async () => {
    const res = await api().post('/api/projects').send({ name: 'A', description: '   ' });
    expect(res.status).toBe(201);
    expect(res.body.description).toBeNull();
  });

  it('creates an initial application URL when provided', async () => {
    const res = await api().post('/api/projects').send({ name: 'A', url: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(res.body.urlCount).toBe(1);
    expect(res.body.urls[0].url).toBe('https://example.com/');
  });

  it('rejects a missing or blank name with field errors', async () => {
    const res = await api().post('/api/projects').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields.name).toBe('Name is required');
  });

  it('rejects a name longer than 120 characters', async () => {
    const res = await api().post('/api/projects').send({ name: 'x'.repeat(121) });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.name).toMatch(/120/);
  });

  it('rejects non-http initial URLs', async () => {
    const res = await api().post('/api/projects').send({ name: 'A', url: 'ftp://example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.url).toMatch(/http/);
  });

  it('rejects malformed JSON', async () => {
    const res = await api().post('/api/projects').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('GET /api/projects', () => {
  it('returns an empty list when there are no projects', async () => {
    const res = await api().get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });

  it('lists projects with URL counts, most recently updated first', async () => {
    await createProject({ name: 'Older' });
    await new Promise((r) => setTimeout(r, 15)); // guarantee distinct updatedAt
    await createProject({ name: 'Newer', url: 'https://example.com' });
    const res = await api().get('/api/projects');
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((p) => p.name)).toEqual(['Newer', 'Older']);
    expect(res.body.items[0].urlCount).toBe(1);
    expect(res.body.items[0].urls).toBeUndefined();
  });

  it('filters by name', async () => {
    await createProject({ name: 'Billing Portal' });
    await createProject({ name: 'Marketing Site' });
    const res = await api().get('/api/projects').query({ q: 'billing' });
    expect(res.body.items.map((p) => p.name)).toEqual(['Billing Portal']);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns the project with its URLs', async () => {
    const p = await createProject({ name: 'A', url: 'https://example.com' });
    const res = await api().get(`/api/projects/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.urls).toHaveLength(1);
  });

  it('returns 404 for an unknown project', async () => {
    const res = await api().get('/api/projects/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Project not found' });
  });
});

describe('PATCH /api/projects/:id', () => {
  it('updates the name', async () => {
    const p = await createProject({ name: 'Old', description: 'keep' });
    const res = await api().patch(`/api/projects/${p.id}`).send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'New', description: 'keep' });
  });

  it('clears the description with null or an empty string', async () => {
    const p = await createProject({ name: 'A', description: 'text' });
    const res = await api().patch(`/api/projects/${p.id}`).send({ description: '' });
    expect(res.body.description).toBeNull();
  });

  it('rejects an empty body', async () => {
    const p = await createProject();
    const res = await api().patch(`/api/projects/${p.id}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields._).toMatch(/at least one/i);
  });

  it('rejects a blank name', async () => {
    const p = await createProject();
    const res = await api().patch(`/api/projects/${p.id}`).send({ name: ' ' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown project', async () => {
    const res = await api().patch('/api/projects/nope').send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id', () => {
  it('deletes the project and cascades to its URLs', async () => {
    const p = await createProject({ name: 'A', url: 'https://example.com' });
    const res = await api().delete(`/api/projects/${p.id}`);
    expect(res.status).toBe(204);
    expect((await api().get(`/api/projects/${p.id}`)).status).toBe(404);
    expect(await prisma.projectURL.count()).toBe(0);
  });

  it('returns 404 for an unknown project', async () => {
    const res = await api().delete('/api/projects/nope');
    expect(res.status).toBe(404);
  });
});
