# Masar Al-Tamayoz (AI Exam): Critical Issues Report

**Date:** 2026-09-17
**Scope:** `backend/` (NestJS + Prisma + BullMQ + Gemini) and `frontend/` (Next.js 16), audited as they are now, before the RAG integration and restructuring.
**Method:** code review, a local run (Postgres, Redis and MinIO in containers), backend test and lint runs, and live API calls.

**Severity:** 🔴 Critical (security, data loss, or blocks RAG) · 🟠 High (breaks core features or workflow) · 🟡 Medium

---

## 1. Executive summary

1. **SQL injection in the RAG retrieval path.** Values from the request, and from the AI's reading of a student's chat message, are pasted directly into SQL.
2. **The "vector search" is not really vector search.** There is no pgvector extension, embeddings are stored as a plain `Float[]`, there is no vector index, and similarity is computed in JavaScript over rows loaded into memory. Arabic text is indexed with the **English** full-text configuration.
3. **The RAG knowledge base can't be filled.** Loading exams, reviewing questions and approving them are admin-only API endpoints, and there is **no admin UI**. The bank is empty, so every question-generation request fails.
4. **No clear development workflow.** There are two unrelated repos (the backend has no git at all), CI is commented out, the deploy workflow file is empty, the backend has 411 lint errors, and the frontend and backend share no API contract.
5. **The frontend is mostly a front with nothing behind it.** Ten linked routes didn't exist, the student data model lives only in the browser, and IDs and content are hardcoded for a different database.

---

## 2. Security 🔴

| # | Issue | Evidence | Impact |
|---|---|---|---|
| S1 | **SQL injection** via `$queryRawUnsafe` with string-built filters (`subjectId`, `topicId`, `bloomTaxonomy`) | `backend/src/questions/services/question-generation.service.ts:203-240` | `topicId` comes straight from the request body (`POST /questions/generate`). In chat it comes from Gemini's extraction of the student's free text (`chat.service.ts:544`), so a crafted message could inject SQL. The path is live whenever pgvector is installed. |
| S2 | **Seeding resets the admin account to a public password** | `backend/prisma/seed.ts:86-94`: an `upsert` sets `admin@example.com` / `AdminPassword123!` on every run | Running the seed against staging or production resets the admin password to one anyone can read in the repo. |
| S3 | **Tokens exposed to JavaScript** | The backend sets `httpOnly` cookies but *also* returns tokens in the response body, and the frontend stores them in `localStorage` | This cancels the protection `httpOnly` gives. Any XSS means full account takeover, including the refresh token. |
| S4 | **Hardcoded fallback JWT secret** (`'ai-exam-dev-secret'`) | `auth.module.ts:36`, `jwt.strategy.ts:23` | It is only blocked when `NODE_ENV === 'production'` exactly. A staging server or a missing `NODE_ENV` signs tokens with a public secret. |
| S5 | **Page protection happens only in the browser** | Every protected page checks `localStorage` inside `useEffect`, and there is no server-side check (`proxy`/middleware) | Pages and bundles are served to anyone. Expired tokens leave the app "logged in", because `AuthContext` ignores 401 responses (`context/AuthContext.tsx:~110`). |

---

## 3. RAG pipeline (blocks the planned integration) 🔴

| # | Issue | Evidence | Impact |
|---|---|---|---|
| R1 | **pgvector is not installed or migrated.** Embeddings are `Float[]`, not `vector(768)`. | `schema.prisma:185`. No `CREATE EXTENSION vector` in any migration. `pg_extension` only lists `plpgsql`. | Code comments promise an "HNSW index for O(log n)", but no such index exists. |
| R2 | **Any future index would go unused.** The query casts `embedding::vector` on every call. | `question-generation.service.ts:~216` | Even after installing pgvector, every search reads the whole table. |
| R3 | **Fallback and hybrid search do similarity in memory.** They load candidate rows, embeddings included, and run cosine similarity in JS. | `question-generation.service.ts` fallback (50 rows sorted in JS); `exam-bank/services/hybrid-search.service.ts:114-145` loads *all* matching rows | Memory and latency grow with the bank, and retrieval quality depends on which 50 rows happen to load. |
| R4 | **Arabic content is indexed with the English full-text configuration** (`to_tsvector('english', …)`) | `hybrid-search.service.ts:162-163` | Keyword ranking is effectively useless for Arabic text. The `searchVector` column is declared but never filled: there is no trigger or write. |
| R5 | **No way to fill the knowledge base.** Upload, extraction, staging review and approval are `ADMIN` API endpoints only, and there is no admin frontend. | `exam-bank.controller.ts`, `staging.controller.ts` | The bank is empty. Every call to `/questions/generate` and every chat request for questions returns **400 "No approved exam bank questions"** (confirmed live). |
| R6 | **Only exam *questions* are indexed.** Textbook PDFs (`bookPdfKey`) are stored for download only, and there is no chunking, embedding or retrieval over course content. | `subject.service.ts`; `extraction.processor.ts` sends the whole PDF to Gemini in a single call | The AI can't explain or summarize lessons, which the UI advertises (for example "لخّص الدرس", "اسأل أي سؤال"). |
| R7 | **The chat can only generate questions.** Intents are `GENERATE_QUESTIONS`, `FOLLOW_UP`, `GREETING` and `OFF_TOPIC`, and anything else is refused. | `chat.service.ts:255-275` | A normal study question like "explain integration by parts" is refused as off-topic. |
| R8 | **Failed generations use up quota.** The rate-limit guard increments the Redis counter before any work is done. | `generation-rate-limit.guard.ts:54` | Gemini errors and empty-bank errors all count against the daily limit of 20. Quota values also come back as strings (`"quotaLimit":"20"`) because config is never validated. |
| R9 | **No retrieval evaluation or observability.** There are no metrics for retrieval hits, grounding or cost per request, and the prompts and model names are only in the code and env. | n/a | RAG quality can't be measured or regression-tested. |

---

## 4. Architecture and workflow 🟠

| # | Issue | Evidence |
|---|---|---|
| A1 | **No single repo and no version control on the backend.** `frontend/` is its own git repo, and `backend/` has no git history at all. | There is no monorepo, shared tooling, or linked history. Changes to the two apps can't be reviewed or released together. |
| A2 | **No CI/CD.** | `frontend/.github/workflows/ci.yml` is fully commented out, `cd-staging.yml` is **empty** (0 bytes), and the backend has no pipeline. |
| A3 | **No API contract between frontend and backend.** | Response types are hand-copied in the frontend, and there are at least 4 different fetch patterns (`fetch` with an env URL, `fetchWithAuth`, `API_BASE_URL` constants, and a hardcoded `https://backend-e3we.onrender.com`). Backend changes break the frontend without anyone noticing. |
| A4 | **Unclear deployment target.** | `main.ts` exports a Vercel serverless handler, but BullMQ workers (extraction, embedding, style analysis) run in the same process and can't run on serverless. Hardcoded origins mention Vercel, Render, and ports `5173`/`8091`. |
| A5 | **Environment setup isn't reproducible.** | Until this session there was no compose file for Postgres, Redis and MinIO. The backend README is the Nest boilerplate, the frontend has no `.env` example, config is never validated at startup, and the CORS allowlist is hardcoded and left out the frontend's own dev port (`localhost:3000`). |
| A6 | **Code quality gates are missing or failing.** | Backend ESLint: **411 errors / 20 warnings**. Backend tests pass (308 of 308) but mock Gemini, S3 and the database, so none of the RAG flow is integration-tested. The frontend has **no tests**. |

---

## 5. Frontend 🟠

| # | Issue | Evidence |
|---|---|---|
| F1 | **Missing pages.** Header and footer linked to 10 routes that didn't exist (quizzes, archive, results, daily plan, AI chat, contact, FAQ, privacy, success stories), all returning 404. | Built during this session and still uncommitted. |
| F2 | **No backend storage for student progress.** Quiz attempts, scores and daily plans have no API endpoints. | The new pages can only use `localStorage`, so data is lost when switching device or browser and invisible to the backend (no analytics, no personalization for RAG). |
| F3 | **Hardcoded IDs and content for a different database.** | `Subjects/subjectsData.ts:3`: `BRANCH_IDS` don't match any branch in the DB and name a "ريادي" branch that isn't seeded. Icons and descriptions are attached by fuzzy matching Arabic names. |
| F4 | **Fake or non-working UI.** | The contact form only waits 1 second and sends nothing (`ContactForm.tsx:91`). The newsletter input, bell and search buttons did nothing. Stats are hardcoded and contradict each other: "2M+ students" in the hero vs "300" in the stats section. |
| F5 | **Structural defects.** | `AuthProvider` was mounted twice (root layout and `(main)` layout). The `/home` page component declared a `children` prop. Every page is a client component, with no server rendering or data fetching. Three animation libraries (GSAP, Framer Motion, Swiper) inflate the bundle. |
| F6 | **Auth and branch state is inconsistent.** | Admin accounts get a generic error when choosing a branch (backend returns 403). The profile is synced with plain `fetch` and doesn't handle 401. The "select then change" branch logic relies on guessing from status codes. |

---

## 6. Priority order

1. **Fix the security holes first:** S1 (parameterize all raw SQL), S2, S3 and S4.
2. **Set up the working environment:** one monorepo with git, CI (lint, types, tests), a validated env schema, and compose-based local setup (A1, A2, A5).
3. **Rebuild the data layer for RAG:** pgvector migration with a `vector(768)` column and HNSW index, Arabic-aware text search, and chunked indexing of textbooks (R1–R4, R6).
4. **Build the admin ingestion UI and an API contract:** generated types or a shared OpenAPI client (R5, A3).
5. **Add student data endpoints:** attempts, results and plans, before building more frontend features on `localStorage` (F2).
