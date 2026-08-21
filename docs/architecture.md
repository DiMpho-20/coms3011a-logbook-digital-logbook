# System Architecture

## 1. Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend** | React | 19 | UI framework |
| | Vite | 8 | Dev server & build tool |
| | TypeScript | 6 | Type safety |
| | Tailwind CSS | 3 | Utility-first styling |
| | Lucide React | — | Icon library |
| **Backend** | Express | 5 | HTTP API framework |
| | TypeScript | 6 | Type safety |
| | Zod | 4 | Request validation schemas |
| | Prisma ORM | 7 | Database access & migrations |
| **Database** | PostgreSQL | — | Hosted on [Neon](https://neon.tech) (serverless) |
| | `@prisma/adapter-pg` | 7 | Prisma driver adapter for `pg` |
| **Shared** | `@logbook/shared` | 1.0.0 | Shared TypeScript interfaces consumed by both frontend and backend |
| **Testing** | Vitest | 4 | Test runner |
| | Supertest | 7 | HTTP-level integration tests |
| **Workspace** | npm workspaces | — | Monorepo package management |

## 2. Monorepo Layout

```
coms3011a-logbook-digital-logbook/
├── apps/
│   ├── frontend/            # React + Vite SPA
│   │   ├── src/
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── App.tsx      # Root component + routing
│   │   │   ├── Dashboard.tsx        # Project list & management
│   │   │   ├── DashboardView.tsx    # Stats overview cards
│   │   │   ├── ProjectDetail.tsx    # Single project detail view
│   │   │   ├── EntryBrowser.tsx     # Entry creation & browsing
│   │   │   ├── api.ts       # API client (fetch wrappers)
│   │   │   └── main.tsx     # Entry point
│   │   └── package.json
│   │
│   └── backend/             # Express REST API
│       ├── prisma/
│       │   └── schema.prisma        # Database schema
│       ├── src/
│       │   ├── controllers/ # Business logic
│       │   ├── routes/      # Express route definitions
│       │   ├── schemas/     # Zod validation schemas
│       │   ├── __tests__/   # Vitest integration tests
│       │   ├── app.ts       # Express app (exported for testing)
│       │   ├── index.ts     # Server startup
│       │   └── prisma.ts    # Prisma client singleton
│       ├── vitest.config.ts
│       └── package.json
│
├── packages/
│   └── shared/              # @logbook/shared package
│       ├── src/index.ts     # Shared TypeScript interfaces
│       └── package.json
│
├── docs/                    # MkDocs documentation
├── mkdocs.yml
└── package.json             # Workspace root
```

## 3. Database Schema (ERD)

The database uses four models defined in `apps/backend/prisma/schema.prisma`:

```
┌──────────────┐       ┌──────────────────┐
│   Project    │       │   EntryField      │
├──────────────┤       ├──────────────────┤
│ id (UUID PK) │──┐    │ id (UUID PK)     │
│ user_id      │  │    │ project_id (FK)──┼──→ Project
│ name         │  │    │ name             │
│ description  │  ├───→│ type (enum)      │
│ status       │  │    │ required         │
│ created_at   │  │    │ created_at       │
│ updated_at   │  │    │ updated_at       │
└──────────────┘  │    └──────────────────┘
                  │
                  │    ┌──────────────────┐     ┌──────────────────┐
                  │    │  LogbookEntry    │     │   EntryValue     │
                  │    ├──────────────────┤     ├──────────────────┤
                  └───→│ id (UUID PK)     │──┐  │ id (UUID PK)     │
                       │ project_id (FK)  │  │  │ entry_id (FK)────┼──→ LogbookEntry
                       │ duration_minutes │  └─→│ field_id (FK)────┼──→ EntryField
                       │ entry_date       │     │ value (text)     │
                       │ due_date         │     └──────────────────┘
                       │ created_at       │
                       │ updated_at       │     @@unique([entry_id, field_id])
                       └──────────────────┘
```

### Enums

- **ProjectStatus**: `ACTIVE`, `ARCHIVED`
- **EntryFieldType**: `TEXT`, `NUMBER`, `DATE`, `BOOLEAN`

### Constraints

- `Project`: `UNIQUE(user_id, name)` — a student cannot have two projects with the same name.
- `EntryValue`: `UNIQUE(entry_id, field_id)` — one value per field per entry.
- All foreign keys use `ON DELETE CASCADE` for full account erasure.

## 4. API Reference

All routes are prefixed with `/api`. Authentication is via `x-user-id` header (UUID of the current user).

### Projects

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/projects` | List all projects for the authenticated user |
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects/:id` | Get a single project with its entry fields |
| `PUT` | `/api/projects/:id` | Update project name, description, or status |
| `PATCH` | `/api/projects/:id/status` | Toggle project status (ACTIVE / ARCHIVED) |
| `GET` | `/api/projects/:id/time-summary` | Aggregate time stats for a project |

### Entry Fields

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/projects/:projectId/entry-fields` | List entry fields for a project |
| `POST` | `/api/projects/:projectId/entry-fields` | Create a new entry field |

### Entries

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/projects/:projectId/entries` | List all entries for a project |
| `POST` | `/api/projects/:projectId/entries` | Create a new entry with field values |
| `PUT` | `/api/entries/:id` | Update entry duration, dates, or values |
| `DELETE` | `/api/entries/:id` | Delete an entry |

### Utility

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/db-check` | Database connectivity check |

### Validation

All request bodies are validated with Zod schemas before reaching controller logic. Invalid requests receive a `400` response. Unique constraint violations (application-level pre-check or Prisma `P2002`) return `409`.

## 5. Shared Types Package

The `@logbook/shared` package (`packages/shared/src/index.ts`) exports TypeScript interfaces consumed by both frontend and backend:

- `Project`, `ProjectWithFields`
- `EntryField`, `EntryFieldType`
- `Entry`, `EntryFieldValue`
- `TimeSummary`
- `CreateProjectInput`, `UpdateProjectInput`
- `CreateEntryInput`, `UpdateEntryInput`
- `CreateEntryFieldInput`
- `ApiError`

This eliminates type duplication and ensures the frontend API client and backend controllers agree on data shapes.

## 6. Frontend Component Architecture

```
App (BrowserRouter)
└── Dashboard
    ├── DashboardView           # Stats: active projects, entries this week, time
    ├── ProjectDetail           # Single project: time summary, fields, entries
    ├── ShipManagement          # Project CRUD form (create/edit/toggle archive)
    └── EntryBrowser            # Entry creation & browsing per project
```

- **`api.ts`** — Centralised fetch wrapper. All HTTP calls go through typed functions that return shared interfaces.
- **`Dashboard.tsx`** — Top-level orchestrator. Loads projects, manages selected-project state, conditionally renders `ProjectDetail` or the project list.

## 7. Testing

- **Framework:** Vitest with `supertest` for HTTP-level integration tests.
- **Location:** `apps/backend/src/__tests__/api.test.ts`
- **Coverage:** 27 tests covering all API endpoints (health, projects CRUD, entry fields, entries CRUD, time summary, status toggling).
- **Run:** `npm test` from `apps/backend/` (or `npm run test --workspace=backend` from root).
- **Timeout:** 15s per test to accommodate Neon cloud database latency.
