# Digital Logbook (COMS3011A)

**Group:** no-boys-just-bugs

A web-based digital logbook application designed to help university students keep track of their projects, work completed, time spent, and tasks that still need to be done.

## Deployed Application

| Environment | URL |
|---|---|
| **Live App** | <https://coms3011a-logbook.pages.dev> |
| **API Server** | <https://digital-logbook-backend-latest.onrender.com> — endpoints are under `/api`, e.g. [`/api/health`](https://digital-logbook-backend-latest.onrender.com/api/health) |
| **Documentation** | <https://no-boys-just-bugs-digital-logbook-doc.netlify.app/> |
| **Repository** | <https://github.com/DiMpho-20/coms3011a-logbook-digital-logbook> |
| **Course mirror (Wits Gitea)** | <https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook> |

The API runs on Render's free tier, which sleeps when idle. A cron-job.org pinger keeps it awake from 06:00 to midnight (see [Keeping the API awake](docs/setup.md#keeping-the-api-awake)); outside those hours the first request can take up to a minute while it wakes.

## Overview

The Digital Logbook is intended to replace a physical logbook with a flexible digital version that can be accessed wherever the user is.

The core idea of the system is that each project can have its own **customisable logbook entry format**. Users can define the fields that an entry contains and the type of value each field stores. This allows the logbook to adapt to different projects rather than forcing every project to use the same fixed entry structure.

This repository is organised as a monorepo containing the frontend application, backend API, and shared TypeScript definitions.

## Project Goals

The main goals of the Digital Logbook are to:

* Allow users to create and manage projects.
* Allow users to customise the fields used in their logbook entries.
* Make capturing new entries quick and easy.
* Record the amount of time spent on projects.
* Provide useful statistics about the user's work.
* Allow users to browse and search previous entries.
* Allow users to filter entries by project.
* Allow projects to be archived when they are no longer active.

## Features

### Core (Sprint 1)

* **User authentication** — registration, login, email verification, password reset, account deletion with a 30-day grace period, and optional two-factor authentication with recovery codes
* **Customisable entry formats** — each project defines its own logbook entry fields
* **Quick entry capture** — create logbook entries with time tracking and a live stopwatch
* **Project management** — create, describe, archive, and organise projects
* **Entry browser** — search and filter entries across all projects

### Intermediate (Sprint 2)

* **Rich field types** — tags, checklists, links, references and computed fields
* **Editable, versioned entry formats** — change a format without breaking older entries
* **Statistics** — totals, grouping and charts over any custom field
* **Calendar, board and open-work views** — with due dates and overdue tracking
* **Offline capture** — entries made offline sync when the connection returns
* **Export and import** — export as JSON or CSV, import from a JSON backup
* **Google Calendar sync** — entry due dates in your own calendar

### Advanced (Sprint 3)

* **Custom expressions and saved statistics** — write `SUM({Hours}) / COUNT()` over your own entries and keep it beside the built-in statistics
* **Personal dashboard** — choose and arrange the panels you care about; the layout follows you across devices
* **Automation rules** — tag entries or set their status automatically when they are saved
* **Recurring entries** — entries that repeat daily, weekly or monthly
* **Automatic reminders** — for upcoming and overdue work, stalled entries and daily logging, delivered as push notifications
* **Entry history** — every change is kept; view an entry as it was on any date and restore an earlier version
* **Archiving and performance** — archive old entries; indexed queries and paginated lists for long records
* **Advanced search** — search inside custom fields, combine several filters, and get results ranked by relevance

### My Grades

* **Grade tracking** — add semester or full-year modules (with your own Semester 1 / Semester 2 split), their assessments, weights and marks; see what you've secured, your average on marked work, the mark you need for a target, and try what-if marks without saving them
* **Assessment dates** — due and test dates with an upcoming list and countdowns

### User Experience

* **Profile page** — avatar upload, bio/slogan, degree, year, and student number
* **Settings** — account management, 2FA, dark/light theme, notifications, and data export/import
* **Responsive design** — works on desktop and mobile with a collapsible sidebar
* **Dark mode** — system-aware or manual toggle, and reduced motion for users who ask for it

## Technology Stack

### Frontend

* React 19 with TypeScript
* Vite 8 (build tooling)
* Tailwind CSS v4 (design system with `@theme` directive)
* React Router v7 (client-side routing with nested protected routes)
* Axios (HTTP client with JWT and expired-session interceptors)
* A service worker for offline use and push notifications

### Backend

* Node.js 22 with TypeScript
* Express 5 (REST API)
* Prisma 7 (ORM with driver adapter pattern)
* bcryptjs (password hashing) and jsonwebtoken (JWT authentication)
* otplib and qrcode (two-factor authentication)
* express-rate-limit (rate limiting on sign-in, sign-up and 2FA)
* Resend, with nodemailer / Gmail SMTP as a fallback (email)
* web-push (reminder notifications) and googleapis (Google Calendar)
* Zod (schema validation, shared with frontend)

### Database

* PostgreSQL (hosted on [Neon](https://neon.tech))

### Shared Package

The `@logbook/shared` package (`packages/shared/`) contains TypeScript definitions, Zod schemas, and interfaces shared between the frontend and backend.

### Testing and CI

* Vitest with Supertest (backend) and Testing Library (frontend)
* Gitea Actions typechecks, lints, runs both test suites with coverage, and builds on every push; a passing push to `main` deploys the API to Render and the frontend to Cloudflare Pages

## Project Structure

```text
coms3011a-logbook-digital-logbook/
│
├── apps/
│   ├── frontend/
│   │   ├── public/sw.js         # Service worker: offline shell, push notifications
│   │   ├── src/
│   │   │   ├── components/      # Reusable UI components
│   │   │   ├── pages/           # Route pages (Dashboard, Projects, Entries, Stats, …)
│   │   │   ├── lib/             # Offline cache, reminders, dashboard insights, helpers
│   │   │   ├── api/             # Axios client with JWT interceptor
│   │   │   ├── api.ts           # Typed API wrapper functions
│   │   │   ├── App.tsx          # Router configuration
│   │   │   └── index.css        # Tailwind v4 theme and global styles
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── backend/
│       ├── prisma/              # Prisma schema and migrations
│       ├── src/
│       │   ├── controllers/     # Request handlers
│       │   ├── routes/          # Express route definitions
│       │   ├── middleware/      # Auth and rate-limit middleware
│       │   ├── utils/           # Domain logic: formats, versions, expressions,
│       │   │                    #   automation, recurrence, reminders, push, auth
│       │   ├── services/        # Google Calendar client
│       │   ├── jobs/            # Background jobs (recurring entries, reminder
│       │   │                    #   pushes, deleted-account purge)
│       │   ├── schemas/         # Validation schemas
│       │   └── __tests__/       # Vitest tests
│       ├── .env.example
│       └── package.json
│
├── packages/
│   └── shared/                  # @logbook/shared — shared types and Zod schemas
│
├── docs/                        # Documentation (MkDocs), grouped by subject
│   ├── index.md                 # Home page and documentation map
│   ├── setup.md                 # Setup guide and troubleshooting
│   ├── architecture/            # System architecture, authentication analysis
│   ├── api/                     # Endpoint reference
│   ├── testing/                 # Test strategy and quickstart
│   ├── project/                 # Methodology, client logs, user stories,
│   │                            #   user feedback, third-party code, audits
│   ├── design/                  # Design artefacts: ERD, UI, plan, roadmap
│   └── extra-features/          # AI assistant, My Grades, Calendar sync
├── .gitea/                      # CI workflow and issue records
├── .nvmrc
├── mkdocs.yml
├── package.json
└── package-lock.json
```

## Application Architecture

The frontend and backend are developed as separate applications and communicate through a hand-written HTTP API.

```text
┌──────────────────────────────────────┐
│              Frontend                │
│  React + Vite + TypeScript           │
│  (Cloudflare Pages)                  │
└──────────────────┬───────────────────┘
                   │
                   │ HTTP API (JWT)
                   ▼
┌──────────────────────────────────────┐
│               Backend                │
│  Express + Node.js 22 + TypeScript   │
│  API + background jobs (Render)      │
└──────────────────┬───────────────────┘
                   │
                   │ Prisma
                   ▼
┌──────────────────────────────────────┐
│       PostgreSQL (Neon)              │
└──────────────────────────────────────┘
```

See [System Architecture](docs/architecture/overview.md) for the full picture, including push notifications, Google Calendar and email.

## Development Setup

See [docs/setup.md](docs/setup.md) for the full development setup guide, including every environment variable and a troubleshooting table.

**Quick start:**

```bash
git clone https://github.com/DiMpho-20/coms3011a-logbook-digital-logbook.git
cd coms3011a-logbook-digital-logbook
npm install
npm run build --workspace=packages/shared   # the backend needs the built shared package

cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env: set DATABASE_URL, and blank any placeholder you are not using

cd apps/backend && npx prisma generate && npx prisma migrate deploy && cd ../..
npm run dev --workspace=backend   # Terminal 1 — API on http://localhost:3000
npm run dev --workspace=frontend  # Terminal 2 — app on http://localhost:5173
```

Both servers must be running. If the login page says "Invalid email or password." with correct details, the backend is not running.

## Code Quality and Testing

Before committing code or opening a Pull Request, run the linter and the tests:

```bash
npm run lint
npm run test --workspace=backend
npm run test --workspace=frontend
```

Fix any failures before pushing. See [Testing](docs/testing/strategy.md) and the [Testing Quickstart](docs/testing/quickstart.md).

## Documentation

The full documentation is published at <https://no-boys-just-bugs-digital-logbook-doc.netlify.app/> and lives in `docs/`, grouped by subject. Each folder can be read on its own, and [docs/index.md](docs/index.md) is the map of the whole set.

| Group | Contents |
|---|---|
| [`docs/setup.md`](docs/setup.md) | Development setup, environment variables and troubleshooting. |
| [`docs/architecture/`](docs/architecture/overview.md) | System architecture as built, and the authentication analysis. |
| [`docs/api/reference.md`](docs/api/reference.md) | Every API endpoint with its request and response shapes. |
| [`docs/testing/`](docs/testing/strategy.md) | Test strategy, coverage and proof of passing runs, plus the quickstart. |
| [`docs/project/`](docs/project/methodology.md) | Methodology, client interactions, user stories, user feedback and third-party code. |
| [`docs/design/`](docs/design/architecture.md) | The course design artefacts: architecture, ERD, UI design, plan and roadmap. |
| [`docs/extra-features/`](docs/extra-features/index.md) | Features beyond the user stories: AI assistant, My Grades, Calendar sync. |

To preview the documentation locally:

```bash
pip install mkdocs mkdocs-material
mkdocs serve        # http://127.0.0.1:8000
```

The published site is built from `docs/` by Netlify (`mkdocs build`, publishing `site/`).
That directory is generated output and is not tracked, so edit `docs/` and never `site/`.

## Development Workflow

The project is developed using Git, with GitHub as the primary remote.

A typical workflow is:

```bash
git pull
git switch <your-branch>
# Make changes
npm run lint
git add .
git commit -m "type: description"
git push
```

Commit messages should follow the team's agreed convention, for example:

```text
feat: add project creation
fix: correct entry validation
docs: update setup guide
test: add project creation tests
```

## Project Status

The Basic (Sprint 1), Intermediate (Sprint 2) and Advanced (Sprint 3) requirements are complete: every user story passes its acceptance tests. Beyond the user stories, the app also has My Grades, Google Calendar sync and an AI help assistant. See the [methodology](docs/project/methodology.md) for the board status.
