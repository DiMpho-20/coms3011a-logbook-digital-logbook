# System Architecture

## Overview

The Digital Logbook is designed as a non-monolithic web application consisting
of a React frontend, an Express backend, and a PostgreSQL database.

The frontend communicates with the backend through a hand-written REST API.
The backend handles business logic, authentication, validation, and database
access.

## High-Level Architecture

```
┌─────────────────┐       HTTP/REST        ┌─────────────────┐
│                  │  ───────────────────►  │                  │
│    Frontend      │                        │    Backend       │
│   React + Vite   │  ◄───────────────────  │   Express API    │
│   TypeScript     │     JSON responses     │   TypeScript     │
│   Tailwind CSS   │                        │   Prisma ORM     │
│                  │                        │                  │
└─────────────────┘                        └────────┬─────────┘
                                                    │
                                           Prisma / pg driver
                                                    │
                                           ┌────────▼─────────┐
                                           │                  │
                                           │   PostgreSQL     │
                                           │   (Neon hosted)  │
                                           │                  │
                                           └──────────────────┘
```

The frontend is a single-page application served by Vite during development
and as static files in production. The backend is a standalone Express server.
They communicate exclusively through JSON over HTTP.

## Separation of Concerns

| Layer | Responsibility | Technology |
|---|---|---|
| **Presentation** | UI rendering, user interaction, client-side routing | React 19, Tailwind CSS v4 |
| **API** | Request handling, authentication, validation, business logic | Express 5, Zod, JWT |
| **Data Access** | Type-safe database queries, migrations | Prisma ORM 7 |
| **Persistence** | Relational data storage | PostgreSQL (Neon) |
| **Shared** | Common types and validation schemas | `@logbook/shared` |

The frontend never accesses the database directly. All data flows through the
backend API, ensuring consistent validation and authentication enforcement.

## Authentication Flow

```
┌──────────┐    POST /api/auth/register     ┌──────────┐
│  Client   │  ──────────────────────────►   │ Backend  │
│  (React)  │                                │          │
│           │    POST /api/auth/login         │  bcrypt  │
│           │  ──────────────────────────►   │  verify  │
│           │                                │          │
│           │  ◄──────────────────────────   │          │
│           │    JWT token (Bearer)           │          │
│           │                                │          │
│  Attach   │    GET /api/projects           │  JWT     │
│  token to │  ──────────────────────────►   │  verify  │
│  requests │                                │  middleware│
│           │  ◄──────────────────────────   │          │
│           │    Protected data              │          │
└──────────┘                                └──────────┘
```

1. User registers with email and password.
2. Password is hashed with bcrypt before storage.
3. Email verification is sent via Gmail SMTP (or auto-verified in dev mode).
4. On login, credentials are verified and a signed JWT is returned.
5. The frontend stores the JWT in `localStorage` and attaches it to all
   subsequent requests via an Axios interceptor.
6. The backend `requireAuth` middleware validates the token on protected routes.

## Request Processing Pipeline

Every API request flows through the following pipeline:

```
Request → CORS → Body Parser → Auth Middleware → Zod Validation → Controller → Prisma → Response
```

1. **CORS** — Allows requests from the frontend origin.
2. **Body Parser** — Parses JSON request bodies.
3. **Auth Middleware** — Verifies JWT token (skipped for public routes).
4. **Zod Validation** — Validates request body against defined schemas.
5. **Controller** — Executes business logic.
6. **Prisma** — Performs type-safe database operations.
7. **Response** — Returns JSON with appropriate status code.

## Shared Package

The `@logbook/shared` package (`packages/shared/`) contains TypeScript types
and Zod schemas consumed by both frontend and backend:

- **Types** — `Project`, `Entry`, `EntryField`, `TimeSummary`, etc.
- **Input types** — `CreateProjectInput`, `CreateEntryInput`, etc.
- **Auth schemas** — `registerSchema`, `loginSchema`, `verifyEmailSchema`, etc.

This eliminates type duplication and ensures both sides of the application
agree on data shapes. Changes to a shared type are reflected immediately
in both frontend and backend code.

## Monorepo Structure

```
coms3011a-logbook-digital-logbook/
├── apps/
│   ├── frontend/      # React SPA (Vite)
│   └── backend/       # Express API (tsx)
├── packages/
│   └── shared/        # @logbook/shared (types + schemas)
├── docs/              # MkDocs documentation
└── package.json       # npm workspaces root
```

All packages are managed through npm workspaces. Shared dependencies are
defined at the workspace root where possible, while package-specific
dependencies are defined in each package's `package.json`.
