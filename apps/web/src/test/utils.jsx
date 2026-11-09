import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders } from '../app/providers.jsx';
import { AppRoutes } from '../app/routes.jsx';

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const apiError = (status, code, message, fields) =>
  json({ error: { code, message, ...(fields ? { details: { fields } } : {}) } }, status);

// handlers: { 'METHOD /api/path': body | Response | (call) => body | Response }
export function mockApi(handlers = {}) {
  const calls = [];
  const all = { 'GET /api/health': { status: 'ok', checks: { database: 'ok' } }, ...handlers };
  const fn = vi.fn(async (input, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const call = { method, url: String(input), body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const handler = all[`${method} ${call.url}`];
    if (!handler) return apiError(404, 'NOT_FOUND', `No mock for ${method} ${call.url}`);
    const result = typeof handler === 'function' ? handler(call) : handler;
    return result instanceof Response ? result : json(result);
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn, find: (method, url) => calls.filter((c) => c.method === method && c.url === url) };
}

export function renderRoute(route = '/projects') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <AppProviders queryClient={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

export const project = (overrides = {}) => ({
  id: 'p1',
  name: 'Alpha',
  description: 'First project',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  urlCount: 0,
  ...overrides,
});
