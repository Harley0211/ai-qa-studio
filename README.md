# AI QA Studio — Phase 1 (Foundation)

Local, single-user QA platform. Phase 1 delivers project management only: projects, application URLs,
dashboard and workspace shell. AI generation, evidence uploads, exports, HAR, recordings and settings
are **not** implemented yet (Phase 2+).

## Requirements
Node.js >= 20.12 (uses `process.loadEnvFile`) and npm >= 10.

## Setup
```bash
npm install                      # also runs `prisma generate`
cp apps/server/.env.example apps/server/.env
npm run db:migrate               # creates apps/server/prisma/dev.db and the first migration
```

## Run
```bash
npm run dev                      # API on http://127.0.0.1:4000 + web on http://127.0.0.1:5173
# or separately:
npm run dev:server
npm run dev:web
npm run db:studio                # optional: browse the SQLite database
```
Open **http://127.0.0.1:5173**. Vite proxies `/api` to Express, so the browser never calls the backend directly.

## Test
```bash
npm test                         # backend (Vitest + Supertest) then frontend (Vitest + Testing Library)
npm run test -w @aqs/server
npm run test -w @aqs/web
```
Backend tests build a throwaway `prisma/test.db` from `schema.prisma` and never touch `dev.db`.

## API (Phase 1)
Errors always use `{ "error": { "code", "message", "details?": { "fields": { "<field>": "<msg>" } } } }`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{status, checks:{database}}`, 503 if DB unreachable |
| GET | `/api/projects?q=` | `{items[], total}`; items include `urlCount`, newest-updated first |
| POST | `/api/projects` | `{name, description?, url?}` → 201 project with `urls` |
| GET | `/api/projects/:projectId` | project + `urls[]` |
| PATCH | `/api/projects/:projectId` | `{name?, description?}` (at least one) |
| DELETE | `/api/projects/:projectId` | 204; URLs cascade |
| GET | `/api/projects/:projectId/urls` | `{items[], total}` |
| POST | `/api/projects/:projectId/urls` | `{url, label?}` → 201; 409 `DUPLICATE_URL` |
| PATCH | `/api/projects/:projectId/urls/:urlId` | `{url?, label?}` |
| DELETE | `/api/projects/:projectId/urls/:urlId` | 204 |

## Environment variables (`apps/server/.env`)
| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | |
| `HOST` | `127.0.0.1` | Must be loopback; server refuses to start otherwise |
| `PORT` | `4000` | |
| `DATABASE_URL` | `file:./dev.db` | Relative to `apps/server/prisma/` |
| `CORS_ORIGIN` | `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated allowed origins |

Phase 2 variables (n8n webhook, HMAC secrets, evidence URL TTL, upload limit) are listed commented-out in `.env.example`.

## Security notes
- Loopback-only binding, plus a Host-header guard against DNS rebinding and CORS restricted to the dev origins.
- Stored URLs are limited to http/https without embedded credentials; the UI only renders such links (`rel="noopener noreferrer"`).
- All input is validated with Zod; unknown errors return a generic 500 without internals.
- No secrets in the frontend. n8n/Gemini credentials will live in n8n (Phase 2).
- SSRF protection for website inspection is a Phase 3 requirement; Phase 1 only stores URLs.

## Layout
```
apps/server   Express + Prisma (src/modules/*, src/middleware, src/config, tests/)
apps/web      React + Vite + Tailwind (src/features/*, src/components/*, src/lib/*)
```
