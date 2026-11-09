import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createProject, prisma, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const addUrl = async (projectId, body) => api().post(`/api/projects/${projectId}/urls`).send(body);

describe('POST /api/projects/:id/urls', () => {
  it('adds a URL, normalising it and trimming the label', async () => {
    const p = await createProject();
    const res = await addUrl(p.id, { url: ' https://example.com ', label: '  Staging ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ projectId: p.id, url: 'https://example.com/', label: 'Staging' });
  });

  it.each([
    ['javascript:alert(1)', /http/i],
    ['ftp://example.com', /http/i],
    ['not a url', /valid url/i],
    ['https://user:pass@example.com', /credentials/i],
  ])('rejects %s', async (url, message) => {
    const p = await createProject();
    const res = await addUrl(p.id, { url });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.url).toMatch(message);
  });

  it('rejects a missing URL', async () => {
    const p = await createProject();
    const res = await addUrl(p.id, {});
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.url).toBe('URL is required');
  });

  it('rejects a duplicate URL within the same project with 409', async () => {
    const p = await createProject();
    await addUrl(p.id, { url: 'https://example.com' });
    const res = await addUrl(p.id, { url: 'https://example.com/' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_URL');
    expect(res.body.error.details.fields.url).toBeTruthy();
  });

  it('allows the same URL in different projects', async () => {
    const a = await createProject({ name: 'A' });
    const b = await createProject({ name: 'B' });
    expect((await addUrl(a.id, { url: 'https://example.com' })).status).toBe(201);
    expect((await addUrl(b.id, { url: 'https://example.com' })).status).toBe(201);
  });

  it('returns 404 for an unknown project', async () => {
    const res = await addUrl('nope', { url: 'https://example.com' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/projects/:id/urls', () => {
  it('lists URLs in creation order', async () => {
    const p = await createProject();
    await addUrl(p.id, { url: 'https://one.example.com' });
    await addUrl(p.id, { url: 'https://two.example.com' });
    const res = await api().get(`/api/projects/${p.id}/urls`);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((u) => u.url)).toEqual(['https://one.example.com/', 'https://two.example.com/']);
  });
});

describe('PATCH /api/projects/:id/urls/:urlId', () => {
  it('updates label and URL', async () => {
    const p = await createProject();
    const { body: u } = await addUrl(p.id, { url: 'https://example.com' });
    const res = await api().patch(`/api/projects/${p.id}/urls/${u.id}`).send({ label: 'Prod', url: 'https://prod.example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ label: 'Prod', url: 'https://prod.example.com/' });
  });

  it('rejects changing to a URL that already exists in the project', async () => {
    const p = await createProject();
    await addUrl(p.id, { url: 'https://one.example.com' });
    const { body: second } = await addUrl(p.id, { url: 'https://two.example.com' });
    const res = await api().patch(`/api/projects/${p.id}/urls/${second.id}`).send({ url: 'https://one.example.com' });
    expect(res.status).toBe(409);
  });

  it("does not allow editing another project's URL", async () => {
    const a = await createProject({ name: 'A' });
    const b = await createProject({ name: 'B' });
    const { body: u } = await addUrl(a.id, { url: 'https://example.com' });
    const res = await api().patch(`/api/projects/${b.id}/urls/${u.id}`).send({ label: 'hijack' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id/urls/:urlId', () => {
  it('deletes a URL', async () => {
    const p = await createProject();
    const { body: u } = await addUrl(p.id, { url: 'https://example.com' });
    const res = await api().delete(`/api/projects/${p.id}/urls/${u.id}`);
    expect(res.status).toBe(204);
    expect((await api().get(`/api/projects/${p.id}`)).body.urlCount).toBe(0);
  });

  it("does not allow deleting another project's URL", async () => {
    const a = await createProject({ name: 'A' });
    const b = await createProject({ name: 'B' });
    const { body: u } = await addUrl(a.id, { url: 'https://example.com' });
    const res = await api().delete(`/api/projects/${b.id}/urls/${u.id}`);
    expect(res.status).toBe(404);
    expect(await prisma.projectURL.count()).toBe(1);
  });

  it('returns 404 for an unknown URL', async () => {
    const p = await createProject();
    const res = await api().delete(`/api/projects/${p.id}/urls/nope`);
    expect(res.status).toBe(404);
  });
});
