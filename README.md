# Digital Logbook

A web logbook for university students: projects, the work logged against them, the time it took, and what is still open — with a logbook entry format each project defines for itself.

**Group:** no-boys-just-bugs · **Module:** COMS3011A · **Licence:** MIT

| | |
|---|---|
| **Live app** | <https://coms3011a-logbook.pages.dev> |
| **API** | <https://digital-logbook-backend-latest.onrender.com> (`/api`, e.g. [`/api/health`](https://digital-logbook-backend-latest.onrender.com/api/health)) |
| **Documentation** | <https://no-boys-just-bugs-digital-logbook-doc.netlify.app/> |
| **Repository** | <https://github.com/DiMpho-20/coms3011a-logbook-digital-logbook> |
| **Course mirror (Wits Gitea)** | <https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook> |

> **What is deployed is the submitted snapshot** (`79903cb`, 11 October 2026). The 33 commits since then — helmet and the CORS allowlist on the API, the five split pages, the re-grouped documentation — are on `main` and are not live. Re-deploy before demonstrating anything newer; see `docs/project/audits/audit-2026-11-25-round2.md` (P2-3).

The API runs on Render's free tier and sleeps when idle; a cron-job.org pinger wakes it from 06:00 to midnight (`docs/setup.md`, "Keeping the API awake"). Outside those hours the first request can take up to a minute.

## What it does

A physical logbook has one fixed set of columns. This one lets the student decide, per project, what an entry contains — text, numbers, dates, booleans, tags, checklists, links, references, or a value computed from the other fields — and then does the arithmetic the paper version cannot: totals, groupings, charts, saved expressions, reminders, version history and a dashboard the student arranges.

## Features

**Sprint 1 — the logbook**
Registration, sign-in, email verification, password reset, account deletion with a 30-day grace period, and optional TOTP two-factor authentication with single-use recovery codes · projects with their own entry format · quick entry capture with a stopwatch and a duration · entry browser with search, project filter and overdue flagging · profile and settings.

**Sprint 2 — the flexible logbook**
Rich field types, editable and versioned entry formats, computed fields, statistics over any field, calendar and board views, open-work tracking, offline capture that syncs on reconnect, JSON/CSV export and JSON import, and one-way Google Calendar sync of due dates.

**Sprint 3 — the advanced logbook**
Custom expressions and saved statistics (`SUM({Hours}) / COUNT()`) · a customisable, server-stored dashboard · automation rules · recurring entries · push reminders for due, overdue and stalled work · entry version history with restore · archiving · ranked search across custom fields.

**Beyond the user stories**
*My Grades* — semester and full-year modules, weighted assessments, marks, target marks and what-if projections, with reminders before tests and due dates; *AI Help Assistant* — an in-app chat over Google's Gemini API that answers "how do I…?" and links to the page; *Google Calendar sync*.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19 · TypeScript 6 · Vite 8 · Tailwind CSS v4 · React Router 7 · Axios |
| Backend | Node.js 22 · TypeScript · Express 5 · Zod · Prisma 7 (`@prisma/adapter-pg`) |
| Data | PostgreSQL on Neon |
| Auth | JWT (7 days, revocable via a per-user `tokenVersion`) · bcryptjs · TOTP 2FA (`otplib`) · `express-rate-limit` |
| Integrations | Resend / Brevo / Gmail SMTP (email) · `web-push` (reminders) · Google Calendar API · Google Gemini |
| Testing | Vitest + Supertest (backend) · Vitest + Testing Library + jsdom (frontend) |
| Tooling | npm workspaces · oxlint (frontend) · ESLint (backend) · Docker (API image) · GitHub Actions + Gitea Actions |

## Repository layout

```text
apps/
├── frontend/              Vite SPA
│   ├── src/pages/         one file per route, with entries/ and stats/ split into panels and hooks
│   ├── src/components/    layout, modals, charts, forms
│   ├── src/lib/           offline cache and sync, grade engine, dashboard insights, helpers
│   ├── src/api/           Axios client (JWT, expired-session handling)
│   ├── src/api.ts         typed wrappers per endpoint
│   └── public/            service worker, icons, manifest
└── backend/               Express API
    ├── src/routes/        one router per area, mounted under /api
    ├── src/controllers/   request handling, one file per area
    ├── src/schemas/       Zod request schemas
    ├── src/middleware/    requireAuth, CORS allowlist, rate limits, error handler
    ├── src/utils/         entry formats and versions, expressions, automation, reminders, push, crypto
    ├── src/jobs/          recurring entries, reminder pushes, deleted-account purge
    ├── src/__tests__/     45 Supertest suites against a real PostgreSQL database
    └── prisma/            schema (23 models) and migrations
packages/shared/           @logbook/shared — types and Zod schemas used by both apps
docs/                      documentation, one folder per subject (see below)
```

## Running it locally

Requires Node.js 22.22.2 or newer (`.nvmrc` pins a version) and a PostgreSQL database.

```bash
git clone https://github.com/DiMpho-20/coms3011a-logbook-digital-logbook.git
cd coms3011a-logbook-digital-logbook
npm install
npm run build --workspace=packages/shared     # the backend imports @logbook/shared from dist

cp apps/backend/.env.example apps/backend/.env
# Set DATABASE_URL and JWT_SECRET; blank out any placeholder you are not using.
# The dev script generates the Prisma client and rebuilds the shared package for you.

cd apps/backend && npx prisma migrate deploy && cd ../..

npm run dev --workspace=apps/backend          # terminal 1 — API on http://localhost:3000
npm run dev --workspace=apps/frontend         # terminal 2 — app on http://localhost:5173
```

Check it: `curl http://localhost:3000/api/health` returns `{"status":"ok"}`, and the frontend proxies `/api` to the backend in development. If signing in reports "Invalid email or password" with correct credentials, the API is not running.

`docs/setup.md` has the long version: every environment variable, push notifications, Google Calendar, email providers, seeding demo data and a troubleshooting table.

## Configuration

Everything is read from the environment; `apps/backend/.env.example` is annotated line by line. The short list:

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | always | PostgreSQL connection string. `DIRECT_URL` (Neon endpoint without `-pooler`) is used for migrations only. |
| `JWT_SECRET` | production | The server refuses to start without it in production; outside production it generates one per process, so sessions end on restart. |
| `APP_URL` | email links, Calendar redirect | The frontend origin. |
| `CORS_ORIGINS` | production | Comma-separated exact origins. Unset in production, every cross-origin request is refused and the server says so at boot. `CORS_ORIGIN_PATTERN` covers preview hosts. |
| `TWO_FACTOR_ENCRYPTION_KEY` | optional 2FA | Encrypts TOTP secrets at rest; 2FA setup answers 503 until it is set. |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` / `GOOGLE_TOKEN_ENCRYPTION_KEY` | Calendar sync | All four, or the feature stays off. |
| `RESEND_API_KEY` / `BREVO_API_KEY` / `GMAIL_USER` + `GMAIL_APP_PASSWORD` | email | First configured wins (Brevo → Resend → Gmail SMTP); with none, messages are logged to the console. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | push reminders | `npx web-push generate-vapid-keys`. Unset, reminders stay in-app. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | help assistant | Unset, the assistant's endpoint answers 503 and the chat button explains why. |
| `RATE_LIMIT_*`, `TRUST_PROXY_HOPS`, `PORT` | tuning | Defaults are in `.env.example`; auth limits are off only under `NODE_ENV=test`. |

The frontend takes one build-time variable, `VITE_API_URL` (absolute API base URL for a production build); development ignores it and uses the Vite proxy.

## Scripts

| Where | Command | Does |
|---|---|---|
| root | `npm run lint` | oxlint (frontend) + ESLint (backend) |
| root | `npm test` | both suites |
| backend | `npm run dev` · `build` · `start` · `start:deploy` | tsx watch · `tsc` · `node dist` · migrate then start |
| backend | `npm run test` · `test:coverage` · `typecheck` · `lint` · `seed:demo` | |
| frontend | `npm run dev` · `build` · `preview` · `lint` · `test` · `test:coverage` | |

## Testing

1,646 tests in 100 files, measured 2026-11-25 — 816 backend tests in 45 Supertest suites against a real PostgreSQL database, and 830 frontend tests in 55 files (Testing Library + jsdom).

```bash
npm test --workspace=apps/backend     # 70 s locally
npm test --workspace=apps/frontend    # 167 s locally
npm run test:coverage --workspace=apps/backend
```

Coverage floors are enforced by the configs: 80 % of lines on the backend, 78 % on the frontend (last measured 85.16 % and 80.53 %). A feature is not done until its test file exists and the suite is green — the details, the deliberate gaps and the recorded passing runs are in [`docs/testing/strategy.md`](docs/testing/strategy.md) and [`docs/testing/quickstart.md`](docs/testing/quickstart.md).

## Deployment

| Part | Where | How |
|---|---|---|
| API | Render (Docker) | The repository `Dockerfile` builds the shared package and the API; `npm run start:deploy` applies pending Prisma migrations, then serves. |
| Frontend | Cloudflare Pages | Static `vite build`, uploaded with `wrangler pages deploy` from CI. |
| Database | Neon | Serverless PostgreSQL, reached through Prisma's `pg` adapter. |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | Typecheck, lint, both suites with coverage, then builds. It does not deploy. |
| Deploy | Gitea Actions (`.gitea/workflows/deploy.yaml`) | Same checks, then the Render hook and the Pages upload on a passing push to `main`. |

## Documentation

Published at <https://no-boys-just-bugs-digital-logbook-doc.netlify.app/> and grouped by subject in `docs/`; [`docs/index.md`](docs/index.md) is the map of the whole set.

| Group | Contents |
|---|---|
| [`docs/setup.md`](docs/setup.md) | Development setup, environment variables and troubleshooting. |
| [`docs/architecture/`](docs/architecture/overview.md) | System architecture as built, and the authentication analysis. |
| [`docs/api/reference.md`](docs/api/reference.md) | Every endpoint with its request and response shapes. |
| [`docs/testing/`](docs/testing/strategy.md) | Test strategy, coverage and proof of passing runs, plus the quickstart. |
| [`docs/project/`](docs/project/methodology.md) | Methodology, client interactions, user stories, user feedback and third-party code. |
| [`docs/design/`](docs/design/architecture.md) | The course design artefacts: architecture, ERD, UI design, plan and roadmap. |
| [`docs/extra-features/`](docs/extra-features/index.md) | Features beyond the user stories: AI assistant, My Grades, Calendar sync. |

To preview the site locally: `pip install mkdocs mkdocs-material && mkdocs serve` (<http://127.0.0.1:8000>). `site/` is generated output and is not tracked — edit `docs/`, never `site/`.

## Contributing

GitHub is the primary remote. Before pushing:

```bash
npm run lint
npm test
```

Commits follow Conventional Commits with a lowercase type and a body that says why — `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. One logical change per commit, so a reviewer can read the diff without reading the whole branch.

## Status

Sprint 1, 2 and 3 requirements are complete and every user story has passing acceptance tests; My Grades, Google Calendar sync and the AI help assistant sit beyond them. The board, the per-story owners and the retrospectives are in [`docs/project/methodology.md`](docs/project/methodology.md); open engineering work is in the round-2 audit, [`docs/project/audits/audit-2026-11-25-round2.md`](docs/project/audits/audit-2026-11-25-round2.md).
