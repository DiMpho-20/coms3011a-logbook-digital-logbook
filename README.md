# Digital Logbook (COMS3011A)

**Group:** no-boys-just-bugs

A web-based digital logbook application designed to help university students keep track of their projects, work completed, time spent, and tasks that still need to be done.

## Deployed Application

| Environment | URL |
|---|---|
| **Live App** | <https://coms3011a-logbook.pages.dev> |
| **API Server** | <https://digital-logbook-backend-latest.onrender.com/api> (health check: [`/api/health`](https://digital-logbook-backend-latest.onrender.com/api/health)) |
| **Documentation** | <https://no-boys-just-bugs-digital-logbook-doc.netlify.app/> |
| **Gitea Repository** | <https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook> |

The API runs on Render's free tier, which sleeps when idle. The first request after a quiet spell can take up to a minute while it wakes.

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
* Gitea Actions typechecks, lints, runs both test suites with coverage, and builds on every push

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
├── docs/                        # Project documentation (MkDocs)
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

See [System Architecture](docs/architecture.md) for the full picture, including push notifications, Google Calendar and email.

## Development Setup

See [docs/setup.md](docs/setup.md) for the full development setup guide, including every environment variable and a troubleshooting table.

**Quick start:**

```bash
git clone https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook.git
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

Fix any failures before pushing. See [Testing](docs/testing.md) and the [Testing Quickstart](docs/testing-quickstart.md).

## Documentation

The full documentation is published at <https://no-boys-just-bugs-digital-logbook-doc.netlify.app/> and lives in `docs/`. Good places to start:

* [`docs/setup.md`](docs/setup.md) — Development setup and troubleshooting.
* [`docs/architecture.md`](docs/architecture.md) — System architecture as built.
* [`docs/api-reference.md`](docs/api-reference.md) — Every API endpoint.
* [`docs/methodology.md`](docs/methodology.md) — How the team works, and sprint status.
* [`docs/user-stories/user-stories.md`](docs/user-stories/user-stories.md) — User stories and acceptance tests.
* [`docs/client-interactions.md`](docs/client-interactions.md) — Client meetings and decisions.

To preview the documentation locally:

```bash
pip install mkdocs mkdocs-material
mkdocs serve        # http://127.0.0.1:8000
```

## Development Workflow

The project is developed using Git and Gitea.

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

The Basic (Sprint 1) and Intermediate (Sprint 2) requirements are complete. Sprint 3 (Advanced) is in its final stage: custom statistics, the personal dashboard, automation, recurring entries, reminders, entry history and query performance are done, and archiving and the advanced search stories are being completed. See the [methodology](docs/methodology.md) for the current board status.
