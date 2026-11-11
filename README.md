# AiExam — منصة مسار التميز

Monorepo for the AI exam-prep platform: a Next.js frontend and a NestJS API
that generates curriculum-grounded practice questions with Gemini.

Previously this lived as two unconnected repositories (the frontend had its
own git history, the backend had none) communicating only over HTTP. Both
histories are preserved here via `git subtree`.

## Layout

```
apps/web/        Next.js 16.2.12 · React 19 · Tailwind v4 · App Router
apps/api/        NestJS 11 · Prisma 6 · BullMQ · Gemini · Passport/JWT
packages/types/  Shared HTTP contract, consumed by both apps
docker-compose.yml   Postgres 16 · Redis 7 · MinIO
```

`packages/types` is the single source of truth for request/response shapes.
`apps/api/src/common/types-parity.ts` turns any drift between those types and
the Prisma schema into a compile error.

## Requirements

- Node.js >= 20.9
- PostgreSQL 14 or newer

That is the whole list. Redis and object storage are **optional** — see
[Optional services](#optional-services).

## Getting started

### 1. Install PostgreSQL

Pick whichever suits your machine; no containers required.

**Ubuntu / Debian**
```bash
sudo apt install postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '123123';"
sudo -u postgres createdb ai_exam
```

**macOS**
```bash
brew install postgresql@16 && brew services start postgresql@16
createdb ai_exam
```

**Windows** — run the [EDB installer](https://www.postgresql.org/download/windows/),
then create the `ai_exam` database from pgAdmin or `psql`.

**Prefer not to install anything?** Any hosted Postgres works (Neon, Supabase,
Railway). Take its connection string and skip to step 2.

**Already using containers and happy with them?** `docker compose up -d postgres`
still works. The compose file is kept for that, and for Redis.

### 2. Configure

```bash
cp apps/api/.env.example apps/api/.env
```

Then set two values in `apps/api/.env`:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | e.g. `postgresql://postgres:123123@localhost:5432/ai_exam?schema=public` |
| `JWT_SECRET` | any value in development; `openssl rand -hex 32` for production |

`GEMINI_API_KEY` is only needed for AI question generation and chat. Everything
else runs without it.

### 3. Run

```bash
npm install      # installs all workspaces, builds shared types, generates the Prisma client
npm run db:setup # applies migrations and seeds branches, subjects, teachers and an admin
npm run dev      # api on :3002, web on :3000
```

Open http://localhost:3000. The seed prints the admin account it created.

## Optional services

Neither is needed to run, develop, or test the app.

| Service | What you lose without it | How to enable |
|---|---|---|
| **Redis** | Background jobs: exam extraction, question embedding, style analysis. Requesting one returns 503 with a clear message; nothing else is affected. | Set `REDIS_URL`. `npm run redis:up` starts one via compose if you use containers. |
| **S3 / MinIO** | Nothing. Uploads go to `UPLOAD_DIR` (default `apps/api/uploads`) and are served through signed, expiring links. | Set `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to switch to S3, MinIO, Backblaze B2 or R2. |

When `REDIS_URL` is unset the queues and their workers are not registered at
all, so startup stays quiet rather than retrying a connection that will not
come.

### Environment

`apps/api/.env` is validated at startup by `src/config/env.validation.ts`,
which coerces numeric vars and fails fast in production when a required
secret is missing. Required in production: `DATABASE_URL`, `JWT_SECRET`,
`ENCRYPTION_KEY`. `REDIS_URL` is optional everywhere; production logs a
warning when it is absent, since background jobs are usually wanted there.

`apps/web` needs no `NEXT_PUBLIC_API_URL`. The browser talks to one origin
only — `next.config.ts` rewrites `/api/v1/*` to `API_ORIGIN` (default
`http://localhost:3002`), so there is no CORS preflight and session cookies
are same-site.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs both apps together |
| `npm run build` | Builds types, api, then web |
| `npm run typecheck` | `tsc --noEmit` across all workspaces |
| `npm test` | API unit tests (Jest) |
| `npm run db:setup` | `prisma migrate deploy` + seed |
| `npm run redis:up` / `redis:down` | Optional — start/stop Redis via compose, only if you want background jobs |

## Architecture notes

**Auth is cookie-based.** The API issues `httpOnly` `access_token` and
`refresh_token` cookies and returns no tokens in the response body. Nothing
is stored in `localStorage`. This is what lets pages render on the server
with the session already known — `apps/web/lib/session.ts` reads it, and
`apps/web/proxy.ts` (middleware was renamed to `proxy` in Next 16) guards
routes before any page is served.

**Background work runs on BullMQ**, not in the request: exam extraction,
question embedding, and style-matrix extraction. This is why the API is a
long-running process rather than serverless functions.

**Known gaps** are tracked in `CRITICAL_ISSUES_REPORT.md`. The most
significant: the exam-bank ingestion endpoints are ADMIN-only with no UI, so
the RAG question bank starts empty and generation requests fail until it is
filled; and `question-generation.service.ts` still builds raw SQL by string
interpolation.
