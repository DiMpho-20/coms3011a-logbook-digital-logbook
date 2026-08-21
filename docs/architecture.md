# System Architecture

## 1. Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend** | React | 19 | UI framework |
| | Vite | 8 | Dev server & build tool |
| | TypeScript | 6 | Type safety |
| | Tailwind CSS | 4 | Utility-first styling with `@theme` directive |
| | React Router | 7 | Client-side routing with protected routes |
| | Axios | — | HTTP client with JWT token interceptor |
| | Lucide React | — | Icon library |
| **Backend** | Express | 5 | HTTP API framework |
| | TypeScript | 6 | Type safety |
| | Zod | 4 | Request validation schemas |
| | Prisma ORM | 7 | Database access & migrations |
| | bcryptjs | — | Password hashing |
| | jsonwebtoken | — | JWT authentication tokens |
| | nodemailer | — | Email verification and password reset |
| **Database** | PostgreSQL | — | Hosted on [Neon](https://neon.tech) (serverless) |
| | `@prisma/adapter-pg` | 7 | Prisma driver adapter for `pg` |
| **Shared** | `@logbook/shared` | 1.0.0 | Shared TypeScript types, Zod schemas, and interfaces |
| **Testing** | Vitest | 4 | Test runner |
| | Supertest | 7 | HTTP-level integration tests |
| **Workspace** | npm workspaces | — | Monorepo package management |

## 2. Monorepo Layout

```
coms3011a-logbook-digital-logbook/
├── apps/
│   ├── frontend/            # React + Vite SPA
│   │   ├── src/
│   │   │   ├── components/  # Reusable UI (Sidebar, Modal, PageHeader, etc.)
│   │   │   ├── pages/       # Route pages (Dashboard, Projects, Entries,
│   │   │   │               #   ProjectDetail, Profile, Settings, Login, etc.)
│   │   │   ├── lib/         # Utility functions
│   │   │   ├── api/         # Axios client with JWT interceptor
│   │   │   ├── App.tsx      # Router config (public + protected routes)
│   │   │   ├── index.css    # Tailwind v4 theme and global styles
│   │   │   └── main.tsx     # Entry point
│   │   └── package.json
│   │
│   └── backend/             # Express REST API
│       ├── prisma/
│       │   └── schema.prisma        # Database schema (6 models)
│       ├── src/
│       │   ├── controllers/ # Business logic
│       │   ├── routes/      # Express route definitions (projects, entries, auth)
│       │   ├── middleware/  # JWT auth middleware
│       │   ├── utils/       # Password hashing, email sender
│       │   ├── schemas/     # Zod validation schemas
│       │   ├── __tests__/   # Vitest integration tests (27 tests)
│       │   ├── app.ts       # Express app (exported for testing)
│       │   ├── index.ts     # Server startup
│       │   └── prisma.ts    # Prisma client singleton (driver adapter)
│       └── package.json
│
├── packages/
│   └── shared/              # @logbook/shared package
│       ├── src/index.ts     # Shared types, Zod schemas, interfaces
│       └── package.json
│
├── docs/                    # MkDocs documentation
├── mkdocs.yml
└── package.json             # Workspace root
```

## 3. Database Schema (ERD)

The database uses six models defined in `apps/backend/prisma/schema.prisma`:

```
┌──────────────┐       ┌──────────────────┐
│    User       │       │ PasswordReset     │
├──────────────┤       ├──────────────────┤
│ id (UUID PK) │───┬──→│ id (UUID PK)     │
│ fullName      │   │   │ userId (FK)──────┼──→ User
│ email (unique)│   │   │ tokenHash        │
│ passwordHash  │   │   │ expiresAt        │
│ isEmailVerif. │   │   │ createdAt        │
│ emailVerif.   │   │   └──────────────────┘
│ Token/Expiry  │   │
│ createdAt     │   │   ┌──────────────────┐     ┌──────────────────┐
│ updatedAt     │   └──→│   Project         │     │   EntryField      │
└──────────────┘       ├──────────────────┤     ├──────────────────┤
                       │ id (UUID PK)     │──┐  │ id (UUID PK)     │
                       │ userId (FK)──────┼──┘  │ projectId (FK)───┼──→ Project
                       │ name             │     │ name             │
                       │ description      ├────→│ type (enum)      │
                       │ status           │     │ required         │
                       │ createdAt        │     │ createdAt        │
                       │ updatedAt        │     │ updatedAt        │
                       └──────────────────┘     └──────────────────┘

                       ┌──────────────────┐     ┌──────────────────┐
                       │  LogbookEntry    │     │   EntryValue     │
                       ├──────────────────┤     ├──────────────────┤
                       │ id (UUID PK)     │──┐  │ id (UUID PK)     │
                       │ projectId (FK)──┼──┘  │ entryId (FK)─────┼──→ LogbookEntry
                       │ durationMinutes │     │ fieldId (FK)─────┼──→ EntryField
                       │ entryDate       │  └─→│ value (text)     │
                       │ dueDate         │     └──────────────────┘
                       │ createdAt       │     @@unique([entryId, fieldId])
                       │ updatedAt       │
                       └──────────────────┘
```

### Enums

- **ProjectStatus**: `ACTIVE`, `ARCHIVED`
- **EntryFieldType**: `TEXT`, `NUMBER`, `DATE`, `BOOLEAN`

### Constraints

- `User`: `UNIQUE(email)` — each email can only register once.
- `Project`: `UNIQUE(userId, name)` — a student cannot have two projects with the same name.
- `EntryValue`: `UNIQUE(entryId, fieldId)` — one value per field per entry.
- All foreign keys use `ON DELETE CASCADE` for full account erasure.

## 4. API Reference

All routes are prefixed with `/api`. Protected routes require a `Bearer <token>` in the `Authorization` header (JWT).

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Register a new user (fullName, email, password) |
| `POST` | `/api/auth/login` | No | Log in and receive a JWT token |
| `POST` | `/api/auth/verify-email` | No | Verify email with token from email link |
| `POST` | `/api/auth/forgot-password` | No | Request a password reset email |
| `POST` | `/api/auth/reset-password` | No | Reset password with token from email |
| `DELETE` | `/api/auth/account` | Yes | Delete account (requires password confirmation) |

### Projects

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects` | Yes | List all projects for the authenticated user |
| `POST` | `/api/projects` | Yes | Create a new project |
| `GET` | `/api/projects/:id` | Yes | Get a single project with its entry fields |
| `PUT` | `/api/projects/:id` | Yes | Update project name, description, or status |
| `PATCH` | `/api/projects/:id/status` | Yes | Toggle project status (ACTIVE / ARCHIVED) |
| `GET` | `/api/projects/:id/time-summary` | Yes | Aggregate time stats for a project |

### Entry Fields

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/:projectId/entry-fields` | Yes | List entry fields for a project |
| `POST` | `/api/projects/:projectId/entry-fields` | Yes | Create a new entry field |

### Entries

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/:projectId/entries` | Yes | List all entries for a project |
| `POST` | `/api/projects/:projectId/entries` | Yes | Create a new entry with field values |
| `PUT` | `/api/entries/:id` | Yes | Update entry duration, dates, or values |
| `DELETE` | `/api/entries/:id` | Yes | Delete an entry |

### Utility

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | Health check |
| `GET` | `/api/db-check` | No | Database connectivity check |

### Validation

All request bodies are validated with Zod schemas before reaching controller logic. Invalid requests receive a `400` response. Unique constraint violations (application-level pre-check or Prisma `P2002`) return `409`.

## 5. Shared Types Package

The `@logbook/shared` package (`packages/shared/src/index.ts`) exports TypeScript types, Zod schemas, and interfaces consumed by both frontend and backend:

- `Project`, `ProjectWithFields`
- `EntryField`, `EntryFieldType`
- `Entry`, `EntryFieldValue`
- `TimeSummary`
- `CreateProjectInput`, `UpdateProjectInput`
- `CreateEntryInput`, `UpdateEntryInput`
- `CreateEntryFieldInput`
- **Auth schemas:** `registerSchema`, `loginSchema`, `verifyEmailSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `deleteAccountSchema`
- `ApiError`

This eliminates type duplication and ensures the frontend and backend agree on data shapes.

## 6. Frontend Component Architecture

```
App (BrowserRouter)
├── Public Routes (no auth required)
│   ├── LandingPage                # Homepage with CTA to login/register
│   ├── LoginPage                  # Email + password login
│   ├── RegisterPage               # Full name + email + password registration
│   ├── VerifyEmail                # Email verification via token link
│   ├── ForgotPasswordPage         # Request password reset email
│   └── ResetPasswordPage          # Reset password via token link
│
└── Protected Routes (JWT required)
    └── AppLayout                  # Sidebar + main content area
        ├── DashboardPage          # Stats, recent entries, project overview, overdue count
        ├── ProjectsPage           # Grid/list view with search
        ├── ProjectDetailPage      # Timeline, fields, entry management, stopwatch, time summary
        ├── EntriesPage            # Cross-project entry browser (All / This Week / Overdue tabs)
        ├── SettingsPage           # Account, appearance, notifications, prefs, data
        └── ProfilePage            # Avatar, bio, degree, year, student number
```

- **`api/client.ts`** — Axios instance with request interceptor that attaches the JWT `Bearer` token from `localStorage`.
- **`components/Sidebar.tsx`** — Notion-style dark sidebar with animated glow effects, section labels, user avatar with pulsing ring, and mouse-proximity glow.
- **`components/ProtectedRoute.tsx`** — Checks for JWT token in `localStorage`, redirects to `/login` if missing.

### Planned Features (from 2026-08-21 client meeting)

| Feature | Description | Schema Support | Priority |
|---------|-------------|----------------|----------|
| **Overdue tab** | Entries page gains an "Overdue" filter tab; entries past `due_date` auto-flagged | `due_date` on LogbookEntry exists | P1 |
| **Live stopwatch** | Start/pause/reset stopwatch widget on entry form; saves `duration_minutes` | `duration_minutes` on LogbookEntry exists | P1 |
| **Overdue dashboard stat** | Dashboard stat card showing count of overdue entries | Computed from entries | P1 |
| **Overdue visual indicators** | Red badge/warning icon on overdue entries in all views | Frontend-only | P1 |
| **Deadline reminders** | In-app notifications at 3 days, 1 day, and day-of due date | Computed or new `notifications` table | P2 |
| **Notification indicator** | Bell icon or badge count in sidebar/header | Frontend component | P2 |
| **Calendar API sync** | Google Calendar API integration to sync entry due dates as calendar events | `due_date` on LogbookEntry exists | P2 (Sprint 2) |
| **Per-project time rollup** | Prominent cumulative time display on project detail page | `time-summary` endpoint exists | P1 |

## 7. Testing

- **Framework:** Vitest with `supertest` for HTTP-level integration tests.
- **Location:** `apps/backend/src/__tests__/api.test.ts`
- **Coverage:** 27 tests covering all API endpoints (health, projects CRUD, entry fields, entries CRUD, time summary, status toggling).
- **Run:** `npm test` from `apps/backend/` (or `npm run test --workspace=backend` from root).
- **Timeout:** 15s per test to accommodate Neon cloud database latency.
