# Digital Logbook (COMS3011A)

**Group:** no-boys-just-bugs

A web-based digital logbook application designed to help university students keep track of their projects, work completed, time spent, and tasks that still need to be done.

## Deployed Application

| Environment | URL |
|---|---|
| **Live App** | <https://coms3011a-logbook.pages.dev> |
| **API Server** | <https://coms3011a-logbook.pages.dev> |
| **Documentation** | [Open project documentation](docs/index.md) |
| **Gitea Repository** | <https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook> |



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

### Core Features

* **User authentication** — registration, login, email verification, and password reset
* **Customisable entry formats** — each project defines its own logbook entry fields
* **Quick entry capture** — create logbook entries with time tracking
* **Project management** — create, describe, archive, and organise projects
* **Dashboard** — statistics, recent entries, and project overview at a glance
* **Entry browser** — search and filter entries across all projects

### User Experience

* **Profile page** — avatar upload, bio/slogan, degree, year, and student number
* **Settings** — account management, dark/light theme, notifications, logbook preferences, and data export/import
* **Responsive design** — works on desktop and mobile with a collapsible sidebar
* **Dark mode** — system-aware or manual toggle with accent colour customisation
* **Data portability** — export logbook as JSON or CSV, import from JSON backup

## Technology Stack

### Frontend

* React 19 with TypeScript
* Vite 8 (build tooling)
* Tailwind CSS v4 (design system with `@theme` directive)
* React Router v7 (client-side routing with nested protected routes)
* Axios (HTTP client with JWT token interceptor)

### Backend

* Node.js 22 with TypeScript
* Express 5 (REST API)
* Prisma 7 (ORM with driver adapter pattern)
* bcryptjs (password hashing)
* jsonwebtoken (JWT authentication)
* nodemailer (email verification and password reset)
* Zod (schema validation, shared with frontend)

### Database

* PostgreSQL (hosted on [Neon](https://neon.tech))

### Shared Package

The `@logbook/shared` package (`packages/shared/`) contains TypeScript definitions, Zod schemas, and interfaces shared between the frontend and backend.

## Project Structure

```text
coms3011a-logbook-digital-logbook/
│
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── components/      # Reusable UI components (Sidebar, Modal, etc.)
│   │   │   ├── pages/           # Route pages (Dashboard, Projects, Entries, etc.)
│   │   │   ├── lib/             # Utility functions
│   │   │   ├── api/             # Axios client with JWT interceptor
│   │   │   ├── App.tsx          # Router configuration
│   │   │   └── index.css        # Tailwind v4 theme and global styles
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── backend/
│       ├── prisma/              # Prisma schema
│       ├── src/
│       │   ├── controllers/     # Request handlers
│       │   ├── routes/          # Express route definitions
│       │   ├── middleware/      # Auth middleware
│       │   ├── utils/           # Auth helpers, email sender
│       │   ├── schemas/        # Validation schemas
│       │   └── __tests__/       # Vitest integration tests
│       ├── .env.example
│       └── package.json
│
├── packages/
│   └── shared/                  # @logbook/shared — shared types and Zod schemas
│
├── docs/                        # Project documentation
│   ├── architecture.md
│   ├── client-interactions.md
│   ├── methodology.md
│   ├── setup.md
│   └── user-stories/
│
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
│        React + Vite + TypeScript     │
└──────────────────┬───────────────────┘
                   │
                   │ HTTP API
                   ▼
┌──────────────────────────────────────┐
│               Backend                │
│    Express + Node.js 22 + TypeScript │
└──────────────────┬───────────────────┘
                   │
                   │ Database connection
                   ▼
┌──────────────────────────────────────┐
│             PostgreSQL               │
└──────────────────────────────────────┘
```

## Development Setup

See [docs/setup.md](docs/setup.md) for the full development setup guide.

**Quick start:**

```bash
git clone https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook.git
cd coms3011a-logbook-digital-logbook
npm install
cp apps/backend/.env.example apps/backend/.env

npx prisma db push --schema=apps/backend/prisma/schema.prisma
npm run dev --workspace=backend   # Terminal 1
npm run dev --workspace=frontend  # Terminal 2
```

## Code Quality and Linting

Before committing code or opening a Pull Request, ensure that the project passes the workspace linter:

```bash
npm run lint
```

Fix any linting errors before pushing changes.

## Documentation

Additional project documentation is available in the `docs` directory:

* `docs/index.md` — Documentation overview.
* `docs/setup.md` — Development setup instructions.
* `docs/architecture.md` — Application architecture.
* `docs/client-interactions.md` — Client and API interactions.

The project also includes an `mkdocs.yml` configuration file for the documentation site.

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

The project is currently under active development. The Basic requirements are complete, and Intermediate and Advanced features are planned for later stages.
