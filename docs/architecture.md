# System Architecture

## 1. Tech Stack

| Layer | Technology | Version | Purpose | Why Chosen |
|---|---|---|---|---|
| **Frontend** | React | 19 | UI framework | Component-based architecture, large ecosystem, team familiarity |
| | Vite | 8 | Dev server & build tool | Fast HMR, native ESM, simpler config than Webpack |
| | TypeScript | 6 | Type safety | Catches errors at compile time, improves IDE support, shared types with backend |
| | Tailwind CSS | 4 | Utility-first styling with `@theme` directive | No separate CSS files to manage, consistent design tokens, built-in dark mode, responsive utilities |
| | React Router | 7 | Client-side routing with protected routes | Standard React routing library, supports nested layouts and route guards |
| | Axios | — | HTTP client with JWT token interceptor | Request/response interceptors for automatic JWT attachment, better error handling than fetch |
| | Lucide React | — | Icon library | Lightweight, tree-shakeable, consistent icon set |
| **Backend** | Express | 5 | HTTP API framework | Minimal, flexible, large middleware ecosystem, team familiarity |
| | TypeScript | 6 | Type safety | End-to-end type safety shared with frontend via `@logbook/shared` |
| | Zod | 4 | Request validation schemas | Runtime type validation with TypeScript inference, shared between frontend and backend |
| | Prisma ORM | 7 | Database access & migrations | Type-safe queries, auto-generated client from schema, eliminates SQL injection risks |
| | bcryptjs | — | Password hashing | Industry standard for password storage, pure JS (no native dependencies) |
| | jsonwebtoken | — | JWT authentication tokens | Standard JWT library for Node.js, stateless authentication |
| | nodemailer | — | Email verification and password reset (Gmail SMTP) | Mature email library, supports Gmail SMTP out of the box |
| | resend | — | Alternative email provider (transactional emails) | Modern REST-based email API, fallback when SMTP is unavailable |
| | otplib | 13 | TOTP-based two-factor authentication | Standards-compliant TOTP (RFC 6238), compatible with Google Authenticator |
| | qrcode | — | QR code generation for 2FA authenticator app setup | Generates QR codes for easy authenticator app pairing |
| **Database** | PostgreSQL | — | Hosted on [Neon](https://neon.tech) (serverless) | ACID-compliant relational database, Neon provides serverless scaling and branching |
| | `@prisma/adapter-pg` | 7 | Prisma driver adapter for `pg` | Enables Prisma to use the `pg` driver for Neon's serverless connection pooling |
| **Shared** | `@logbook/shared` | 1.0.0 | Shared TypeScript types, Zod schemas, and interfaces | Single source of truth for data shapes — frontend and backend cannot drift out of sync |
| **Testing** | Vitest | 4 | Test runner | Native ESM support, fast, compatible with Vite ecosystem |
| | Supertest | 7 | HTTP-level integration tests | Tests full request/response cycle against the Express app without starting a server |
| **Workspace** | npm workspaces | — | Monorepo package management | Built into npm, no extra tooling needed, shared dependencies across packages |

## 2. Monorepo Layout

```
coms3011a-logbook-digital-logbook/
├── apps/
│   ├── frontend/            # React + Vite SPA
│   │   ├── src/
│   │   │   ├── components/  # Reusable UI (Sidebar, Modal, PageHeader, AppLayout,
│   │   │   │               #   AuthLayout, AnimatedBackground, GlassCard, etc.)
│   │   │   ├── pages/       # Route pages (Dashboard, Projects, Entries,
│   │   │   │               #   ProjectDetail, Profile, Settings, Login, etc.)
│   │   │   ├── lib/         # Utility functions (formatDuration, date helpers, streak)
│   │   │   ├── api/         # Axios client with JWT interceptor
│   │   │   ├── api.ts       # API wrapper functions (fetch, create, update, delete)
│   │   │   ├── App.tsx      # Router config (public + protected routes)
│   │   │   ├── index.css    # Tailwind v4 theme and global styles
│   │   │   └── main.tsx     # Entry point
│   │   ├── vite.config.ts   # Vite config with /api proxy to backend
│   │   └── package.json
│   │
│   └── backend/             # Express REST API
│       ├── prisma/
│       │   ├── schema.prisma        # Database schema (6 models)
│       │   └── migrations/          # Prisma migration files
│       ├── prisma.config.ts         # Prisma 7 config (reads DATABASE_URL from .env)
│       ├── src/
│       │   ├── controllers/ # Business logic
│       │   ├── routes/      # Express route definitions (projects, entries, auth)
│       │   ├── middleware/  # JWT auth middleware (requireAuth)
│       │   ├── utils/       # Password hashing, email sender, token helpers
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
│ twoFactorSec. │   │   ┌──────────────────┐     ┌──────────────────┐
│ twoFactorEnab.│   └──→│   Project         │     │   EntryField      │
│ scheduledDel. │       ├──────────────────┤     ├──────────────────┤
│ createdAt     │       │ id (UUID PK)     │──┐  │ id (UUID PK)     │
│ updatedAt     │       │ userId (FK)──────┼──┘  │ projectId (FK)───┼──→ Project
└──────────────┘       │ name             │     │ name             │
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

## 7. Two-Factor Authentication (2FA)

The app supports optional TOTP-based two-factor authentication using `otplib` (v13) and `qrcode`:

* **Enable 2FA**: Backend generates a TOTP secret and QR code URI. User scans the QR code with an authenticator app (Google Authenticator, Authy, etc.).
* **Verify 2FA**: User provides a 6-digit TOTP code which is verified against the stored secret.
* **Disable 2FA**: User confirms with their password to disable 2FA and clear the stored secret.
* **Scheduled Deletion**: Users can schedule their account for deletion, which is tracked via the `scheduledDeletionAt` field on the `User` model.

The 2FA secret is stored in the `twoFactorSecret` column on the `User` model. The `isTwoFactorEnabled` boolean flag controls whether 2FA is enforced at login.

## 8. Shared Types Package

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
│   └── AuthLayout                    # Full-screen layout with animated canvas background
│       ├── AnimatedBackground        # Canvas-based particle, light streak & icon animation
│       ├── LandingPage               # Homepage with CTA to login/register
│       ├── LoginPage                 # Email + password login (with 2FA support)
│       ├── RegisterPage              # Full name + email + password registration
│       ├── VerifyEmail               # Email verification via token link
│       ├── ForgotPasswordPage        # Request password reset email
│       └── ResetPasswordPage         # Reset password via token link
│
└── Protected Routes (JWT required)
    └── AppLayout                     # Responsive shell: desktop sidebar + mobile drawer
        ├── Sidebar                   # Notion-style dark sidebar with glow effects
        ├── DashboardPage             # Greeting, stat cards, SVG activity chart, recent entries
        ├── ProjectsPage              # Card grid/list, search, status filter, grid/list toggle
        ├── ProjectDetailPage         # Entry format section, grouped entries, clean modal form
        ├── EntriesPage               # Vertical timeline layout, filters, date sort toggle
        ├── SettingsPage              # Account, 2FA, appearance, notifications, prefs, data
        └── ProfilePage               # Avatar, bio, degree, year, student number
```

### Reusable Components

| Component | File | Purpose |
|---|---|---|
| `AuthLayout` | `components/AuthLayout.tsx` | Full-screen wrapper with `AnimatedBackground` for all auth pages |
| `AnimatedBackground` | `components/AnimatedBackground.tsx` | Canvas-based animation: gradient sky, floating particles, light streaks, drifting logbook icons |
| `GlassCard` | `components/GlassCard.tsx` | Frosted-glass card used as the form container on auth pages |
| `AppLayout` | `components/AppLayout.tsx` | Responsive layout: desktop sidebar + mobile hamburger drawer + `<Outlet />` |
| `Sidebar` | `components/Sidebar.tsx` | Notion-style dark sidebar with animated glow, section labels, user avatar with pulsing ring |
| `ProtectedRoute` | `components/ProtectedRoute.tsx` | Checks for JWT in `localStorage`, redirects to `/login` if missing |
| `StatCard` | `components/StatCard.tsx` | Dashboard metric card (blue/emerald/orange/purple/red/slate variants) |
| `ProjectCard` | `components/ProjectCard.tsx` | Project summary card: name, status dot, entry count, total time, last activity |
| `EntryCard` | `components/EntryCard.tsx` | Entry card with overdue visual indicators (red border, warning badge) |
| `EntryForm` | `components/EntryForm.tsx` | Dynamic entry creation/edit form with field type rendering |
| `Modal` | `components/Modal.tsx` | Generic accessible modal with backdrop and close button |
| `PageHeader` | `components/PageHeader.tsx` | Consistent page title + optional action slot |
| `StatusBadge` | `components/StatusBadge.tsx` | Colored badge for project status (ACTIVE / ARCHIVED) |
| `EmptyState` | `components/EmptyState.tsx` | Placeholder for empty lists |
| `ErrorState` | `components/ErrorState.tsx` | Error message display with retry action |
| `LoadingState` | `components/LoadingState.tsx` | Spinner + loading text |

### API Layer

- **`api/client.ts`** — Axios instance with request interceptor that attaches the JWT `Bearer` token from `localStorage`. Supports `VITE_API_URL` env override.
- **`api.ts`** — Typed wrapper functions for all API calls (projects CRUD, entries CRUD, entry fields, time summary).

### Utility Layer

- **`lib/utils.ts`** — Shared helpers: `formatDuration()`, `todayISO()`, `formatDateHeading()`, `computeStreak()`, `defaultValuesForFields()`, `isEmptyValue()`, `getGreeting()`.

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

## 9. Testing

- **Framework:** Vitest with `supertest` for HTTP-level integration tests.
- **Location:** `apps/backend/src/__tests__/api.test.ts`
- **Coverage:** 27 tests covering all API endpoints (health, projects CRUD, entry fields, entries CRUD, time summary, status toggling).
- **Run:** `npm test` from `apps/backend/` (or `npm run test --workspace=backend` from root).
- **Timeout:** 15s per test to accommodate Neon cloud database latency.
