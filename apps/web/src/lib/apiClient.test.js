import { describe, expect, it, vi } from 'vitest';
import { api, ApiClientError } from './apiClient.js';

describe('apiClient', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    await expect(api.get('/x')).resolves.toEqual({ ok: 1 });
  });

  it('returns null for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api.delete('/x')).resolves.toBeNull();
  });

  it('sends JSON bodies with a content type', async () => {
    const fn = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fn);
    await api.post('/x', { a: 1 });
    expect(fn).toHaveBeenCalledWith('/api/x', expect.objectContaining({
      method: 'POST',
      body: '{"a":1}',
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('turns the server error envelope into an ApiClientError with field errors', async () => {
    const body = { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { fields: { name: 'Name is required' } } } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 400 })));
    const err = await api.post('/x', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', fields: { name: 'Name is required' } });
  });

  it('maps a network failure to a friendly NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await api.get('/x').catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(err.message).toMatch(/backend/i);
  });
});
