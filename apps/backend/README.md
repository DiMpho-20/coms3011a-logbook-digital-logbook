# Backend — Digital Logbook API

The REST API server for the Digital Logbook application. Built with Express 5, TypeScript, and Prisma ORM 7, backed by a PostgreSQL database hosted on [Neon](https://neon.tech).

> For an in-depth guide to the authentication system (JWT, TOTP 2FA, password reset, security properties and known limitations), see **[AUTHENTICATION.md](AUTHENTICATION.md)**.
>
> For the full testing documentation (stack, coverage, policy, and proof of passing runs), see **[TESTING.md](TESTING.md)**.

## Tech Stack

| Technology | Purpose |
|---|---|
| Express 5 | HTTP API framework |
| TypeScript 6 | Type safety |
| Prisma ORM 7 | Database access with driver adapter for `pg` |
| Zod 4 | Request body validation |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT authentication tokens |
| nodemailer | Email verification and password reset (Gmail SMTP) |
| otplib 13 | TOTP-based two-factor authentication |
| qrcode | QR code generation for 2FA setup |
| Vitest + Supertest | Integration testing (78 tests) |

## Project Structure

```
apps/backend/
├── prisma/
│   ├── schema.prisma        # Database schema (6 models)
│   └── migrations/          # Prisma migration files
├── prisma.config.ts         # Prisma 7 config (reads DATABASE_URL from .env)
├── src/
│   ├── controllers/         # Business logic (project, entry, entryField)
│   ├── routes/              # Express route definitions (projects, entries, auth)
│   ├── middleware/          # JWT auth middleware (requireAuth)
│   ├── utils/               # Password hashing, email sender, token helpers
│   ├── schemas/             # Zod validation schemas (project, entry)
│   ├── __tests__/           # Vitest integration tests (api, auth, sprint2)
│   ├── app.ts               # Express app setup (exported for testing)
│   ├── index.ts             # Server startup
│   └── prisma.ts            # Prisma client singleton (driver adapter)
├── .env.example             # Environment variable template
├── eslint.config.mjs        # ESLint configuration
├── package.json
└── tsconfig.json
```

## Getting Started

### 1. Install dependencies

From the repository root:

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (from Neon dashboard) |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `PORT` | Server port (default: `3000`) |
| `APP_URL` | Frontend URL for email links (default: `http://localhost:5173`) |

Optional (for email sending):

| Variable | Description |
|---|---|
| `GMAIL_USER` | Gmail address for SMTP |
| `GMAIL_APP_PASSWORD` | Gmail App Password |

> Without Gmail credentials, accounts are auto-verified in dev mode — no email is sent.

### 3. Set up the database

```bash
cd apps/backend
npx prisma generate
npx prisma migrate deploy
```

The migration history is a single squashed baseline (`prisma/migrations/0_init`), so `migrate deploy` creates the whole schema on an empty database. Make future schema changes with `npx prisma migrate dev --name <change>`, which generates a dated migration alongside the schema edit.

### 4. Run the server

From the repository root:

```bash
npm run dev --workspace=backend
```

The API will be available at `http://localhost:3000`.

## API Endpoints

All routes are prefixed with `/api`. Protected routes require a `Bearer <token>` in the `Authorization` header.

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Register a new user |
| `POST` | `/api/auth/login` | No | Log in and receive a JWT token |
| `POST` | `/api/auth/login/2fa` | No | Complete login with a TOTP code (2FA users) |
| `POST` | `/api/auth/verify-email` | No | Verify email with token |
| `POST` | `/api/auth/forgot-password` | No | Request a password reset email |
| `POST` | `/api/auth/reset-password` | No | Reset password with token |
| `POST` | `/api/auth/2fa/setup` | Yes | Generate TOTP secret + QR code |
| `POST` | `/api/auth/2fa/verify-setup` | Yes | Verify code and enable 2FA |
| `POST` | `/api/auth/2fa/disable` | Yes | Disable 2FA (requires password) |
| `GET` | `/api/auth/2fa/status` | Yes | Check whether 2FA is enabled |
| `DELETE` | `/api/auth/account` | Yes | Delete account |

### Projects

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects` | Yes | List all projects |
| `POST` | `/api/projects` | Yes | Create a new project |
| `GET` | `/api/projects/:id` | Yes | Get a project with entry fields |
| `PUT` | `/api/projects/:id` | Yes | Update project |
| `PATCH` | `/api/projects/:id/status` | Yes | Toggle status (ACTIVE/ARCHIVED) |
| `DELETE` | `/api/projects/:id` | Yes | Permanently delete a project and everything in it |
| `GET` | `/api/projects/:id/time-summary` | Yes | Aggregate time stats |

### Entry Fields

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/:projectId/entry-fields` | Yes | List entry fields |
| `POST` | `/api/projects/:projectId/entry-fields` | Yes | Create entry field |

### Entries

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/projects/:projectId/entries` | Yes | List entries |
| `POST` | `/api/projects/:projectId/entries` | Yes | Create entry with field values |
| `PUT` | `/api/entries/:id` | Yes | Update entry |
| `DELETE` | `/api/entries/:id` | Yes | Delete entry |

### Automation Rules

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/projects/:projectId/automation-rules` | Yes | Create an entry rule (US26) |
| `GET` | `/api/projects/:projectId/automation-rules` | Yes | List the project's rules, in execution order |
| `GET` | `/api/projects/:projectId/automation-rules/:id` | Yes | Read one rule |
| `PATCH` | `/api/projects/:projectId/automation-rules/:id` | Yes | Edit a rule (any subset of fields) |
| `DELETE` | `/api/projects/:projectId/automation-rules/:id` | Yes | Delete a rule |

Rules run automatically when an entry is captured or updated — after the
save commits, so a broken rule can never cost the user their work. The full
rule language (triggers, conditions, actions and their deliberate
limitations) is documented in the
[API reference](../../docs/api-reference.md#automation-rules).

> This table lists the core endpoints. The full surface — tags, entry
> versions and restore, archiving, statistics, reminders, recurring
> entries, custom statistics, Google Calendar — is documented in
> [docs/api-reference.md](../../docs/api-reference.md).

### Utility

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | Health check |
| `GET` | `/api/db-check` | No | Database connectivity check |

## Testing

78 integration tests using Vitest and Supertest, exercising the API against the live Neon database — 27 core API tests, 29 authentication/2FA tests, and 22 Sprint 2 feature tests (entry status, stats, timeline). See **[TESTING.md](TESTING.md)** for full coverage details and proof of passing runs.

```bash
# Run all tests
npm run test --workspace=backend

# Run tests in watch mode
npm run test:watch --workspace=backend
```

Tests are located in `src/__tests__/` (`api.test.ts`, `auth.test.ts`, `sprint2.test.ts`).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled output from `dist/` |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run test` | Run Vitest tests |
| `npm run test:watch` | Run tests in watch mode |
