# Architecture Design

## Overview

The Digital Logbook is designed as a non-monolithic web application consisting
of a React frontend, an Express backend, and a PostgreSQL database.

The frontend communicates with the backend through a hand-written REST API.
The backend handles business logic, authentication, validation, and database
access.

This page explains the design decisions. For the system as built (deployment,
folder layout, data model, API areas and background jobs), see
[System Architecture](../architecture.md).

## Separation of Concerns

| Layer | Responsibility | Technology |
|---|---|---|
| **Presentation** | UI rendering, user interaction, client-side routing, offline cache | React 19, Tailwind CSS v4 |
| **API** | Request handling, authentication, validation, business logic | Express 5, Zod, JWT |
| **Background work** | Recurring entries, reminder pushes, account purges | Jobs in the API process |
| **Data Access** | Type-safe database queries, migrations | Prisma ORM 7 |
| **Persistence** | Relational data storage | PostgreSQL (Neon) |
| **Shared** | Common types and validation schemas | `@logbook/shared` |

The frontend never accesses the database directly. All data flows through the
backend API, ensuring consistent validation and authentication enforcement.

## Authentication Flow

```
┌──────────┐    POST /api/auth/login        ┌──────────┐
│  Client  │  ───────────────────────────►  │ Backend  │
│  (React) │     email + password           │  bcrypt  │
│          │                                │  verify  │
│          │  ◄───────────────────────────  │          │
│          │  JWT, or "2FA required" +      │          │
│          │  5-minute pending token        │          │
│          │                                │          │
│          │    POST /api/auth/login/2fa    │  TOTP or │
│          │  ───────────────────────────►  │ recovery │
│          │  pending token + code          │  code    │
│          │  ◄───────────────────────────  │          │
│          │    JWT (7 days)                │          │
│          │                                │          │
│  Attach  │    GET /api/projects           │ require- │
│  token   │  ───────────────────────────►  │ Auth     │
│          │  ◄───────────────────────────  │          │
│          │    the user's own data         │          │
└──────────┘                                └──────────┘
```

1. The user registers with email and password; the password is hashed with bcrypt before storage.
2. A verification email is sent through Resend or Gmail SMTP. With no email provider configured (development), the account is verified automatically. Sign-in is refused until the email is verified.
3. On sign-in, the password is checked. Without 2FA, a signed JWT valid for seven days is returned.
4. With 2FA on, the backend instead returns a pending token that is valid for five minutes and good only for the second step. The client sends it with a code from the authenticator app, or a single-use recovery code, and receives the JWT. A code on its own is never enough to sign in.
5. The frontend stores the JWT in `localStorage` and attaches it to every request through an Axios interceptor.
6. The backend `requireAuth` middleware validates the token on protected routes.
7. When a protected request returns `401` (the token expired or is invalid), the frontend clears the session and returns to `/login?expired=1`. A wrong password on a credential check is not treated as an expired session.

## Request Processing Pipeline

Every API request flows through the following pipeline:

```
Request → CORS → Body Parser → Rate Limit → Auth Middleware → Zod Validation → Ownership Check → Controller → Prisma → Response
```

1. **CORS**: allows only the origins named in `CORS_ORIGINS`, plus the Vite dev ports outside production. An unset list in production grants nothing.
2. **Body Parser**: parses JSON request bodies.
3. **Rate Limit**: applies to `/api/auth` routes, with tighter limits on sign-in, sign-up and 2FA, to slow down password guessing.
4. **Auth Middleware**: verifies the JWT and sets the user id (skipped for public routes).
5. **Zod Validation**: validates the request body against its schema (`400` on failure).
6. **Ownership Check**: loads the project, entry, rule or statistic named in the path only if it belongs to the signed-in user. A resource owned by someone else is reported as not found (`404`), so its existence is not revealed.
7. **Controller**: executes business logic.
8. **Prisma**: performs type-safe database operations, in a transaction where several rows must change together.
9. **Response**: returns JSON with the appropriate status code.

A valid token only proves who the caller is, not what they may touch, so the
ownership check is a separate step on every route that names a resource.

## Shared Types

Types and validation schemas that both sides need live in one package,
`@logbook/shared`, so the frontend and backend cannot disagree about data
shapes. The frontend reads the package's source directly. The backend uses its
compiled output, so the package must be rebuilt after a change before the
backend sees it. See [System Architecture](../architecture.md#8-shared-types-package).
