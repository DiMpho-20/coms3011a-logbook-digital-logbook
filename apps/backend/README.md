# Backend — Digital Logbook API

The REST API server for the Digital Logbook application. Built with Express 5, TypeScript, and Prisma ORM 7, backed by a PostgreSQL database hosted on [Neon](https://neon.tech). The same process runs the background jobs for recurring entries, reminder push notifications and account purges.

Deployed on Render at <https://digital-logbook-backend-latest.onrender.com>, with every endpoint under `/api` (for example [`/api/health`](https://digital-logbook-backend-latest.onrender.com/api/health)). `/api` on its own is only a prefix, so opening it shows `Cannot GET /api`.

> For an in-depth guide to the authentication system (JWT, TOTP 2FA, recovery codes, password reset, security properties and known limitations), see **[AUTHENTICATION.md](AUTHENTICATION.md)**.
>
> For every endpoint with its request and response shapes, see the **[API reference](../../docs/api/reference.md)**. For the testing documentation, see **[Testing](../../docs/testing/strategy.md)**.

## Tech Stack

| Technology | Purpose |
|---|---|
| Express 5 | HTTP API framework |
| TypeScript 6 | Type safety |
| Prisma ORM 7 | Database access with driver adapter for `pg` |
| Zod 4 | Request body validation |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT authentication tokens |
| otplib 13, qrcode | TOTP two-factor authentication and its QR code |
| express-rate-limit | Rate limiting on sign-in, sign-up and 2FA |
| resend, nodemailer | Email: Resend preferred, Gmail SMTP as a fallback |
| web-push | Reminder push notifications |
| googleapis | Google Calendar sync |
| Vitest + Supertest | Integration and unit tests |

## Project Structure

```
apps/backend/
├── prisma/
│   ├── schema.prisma        # Database schema (23 models)
│   └── migrations/          # 0_init baseline + dated migrations
├── prisma.config.ts         # Prisma 7 config (reads DATABASE_URL from .env)
├── src/
│   ├── controllers/         # Request handling per area
│   ├── routes/              # Express routers, one per area
│   ├── middleware/          # requireAuth (JWT) and rate limiting
│   ├── schemas/             # Zod request schemas
│   ├── utils/               # Domain logic: entry formats and versions, computed
│   │                        #   fields, expressions, automation, recurrence,
│   │                        #   reminders, push, tags, token and crypto helpers
│   ├── services/            # Google Calendar client
│   ├── jobs/                # Recurring entries, reminder pushes, account purge
│   ├── __tests__/           # Vitest + Supertest suite
│   ├── app.ts               # Express app setup (exported for testing)
│   ├── index.ts             # Starts the server and the jobs
│   └── prisma.ts            # Prisma client singleton (driver adapter, read retry)
├── .env.example             # Environment variable template
├── eslint.config.mjs        # ESLint configuration
├── package.json
└── tsconfig.json
```

## Getting Started

### 1. Install dependencies and build the shared package

From the repository root:

```bash
npm install
npm run build --workspace=packages/shared
```

The backend imports `@logbook/shared` from its compiled output, so it fails to start with `Cannot find module '…/@logbook/shared/dist/index.js'` until the package is built. Rebuild it after changing anything in `packages/shared`.

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Blank or delete every placeholder you are not replacing with a real value. A leftover placeholder such as `RESEND_API_KEY=re_xxxxxxxxxxxxx` makes the server think email is configured, so new accounts are no longer auto-verified and cannot sign in.

Required:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (from the Neon dashboard) |
| `PORT` | Server port (default: `3000`) |
| `APP_URL` | Frontend URL for email links and redirects (default: `http://localhost:5173`) |
| `JWT_SECRET` | Signs login tokens. Required in production. Locally, without it, a new secret is generated on every start, so every restart signs you out. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API, e.g. the Pages URL. Required in production: unset there, every cross-origin request is refused. Locally the Vite dev ports are granted anyway. |

Optional — each feature is simply off without its variables:

| Variables | Feature |
|---|---|
| `RESEND_API_KEY`, `RESEND_FROM` | Email via Resend (preferred) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email via Gmail SMTP (used when Resend is not set) |
| `TWO_FACTOR_ENCRYPTION_KEY` | Encrypts 2FA secrets; enabling 2FA returns `503` without it |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` | Google Calendar sync |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Reminder push notifications (generate with `npx web-push generate-vapid-keys`) |
| `RATE_LIMIT_*`, `TRUST_PROXY_HOPS` | Rate-limit tuning; see `.env.example` |

> With no email provider configured, accounts are auto-verified in dev mode and the verification link is logged to the console.

See the [setup guide](../../docs/setup.md#4-configure-environment-variables) for more detail.

### 3. Set up the database

```bash
cd apps/backend
npx prisma generate
npx prisma migrate deploy
```

`migrate deploy` applies the `0_init` baseline and every dated migration after it, so it builds the whole schema on an empty database. Make schema changes by editing `schema.prisma` and running `npx prisma migrate dev --name <change>`, which generates a dated migration — a schema edit without its migration never reaches a database set up this way.

### 4. Run the server

From the repository root:

```bash
npm run dev --workspace=backend
```

The API will be available at `http://localhost:3000`. The startup log says which optional features are off, for example `VAPID keys not set; reminder push notifications are off.`

## API

All routes are prefixed with `/api`. Apart from sign-up, email verification, sign-in, password reset, the Google OAuth callback and the health checks, they require a `Bearer <token>` in the `Authorization` header, and every resource is checked against the signed-in user (another user's data returns `404`).

| Area | Routes |
|---|---|
| Authentication, 2FA, account | `/api/auth/*` |
| Projects | `/api/projects`, `/api/projects/:id`, `/api/projects/:id/status`, `/api/projects/time-summaries`, `/api/projects/:id/time-summary` |
| Entry fields & formats | `/api/projects/:projectId/entry-fields`, `/api/projects/:projectId/entry-format-versions`, `/api/entry-fields/:id` |
| Entries | `/api/entries`, `/api/projects/:projectId/entries`, `/api/entries/:id`, `/api/entries/:id/status`, `/api/me/open-entries` |
| Backup & restore | `/api/import` |
| History & archive | `/api/entries/:id/versions`, `/api/entries/:id/versions/at`, `/api/entries/:id/versions/:version/restore`, `/api/entries/archive`, `/api/entries/:id/archive` |
| Statistics | `/api/projects/:projectId/stats/{group,timeline,expression}`, `/api/projects/:projectId/custom-statistics` |
| Automation | `/api/projects/:projectId/automation-rules`, `/api/recurrences/:id` |
| Reminders & push | `/api/reminders`, `/api/reminders/count`, `/api/reminders/settings`, `/api/push/public-key`, `/api/push/subscriptions` |
| Dashboard | `/api/dashboard/layout` |
| Saved filters | `/api/saved-filters`, `/api/saved-filters/:id` |
| Profile | `/api/me` |
| My Grades | `/api/grades/modules`, `/api/grades/modules/:moduleId`, `/api/grades/modules/:moduleId/assessments`, `/api/grades/assessments/:assessmentId` |
| Help assistant | `/api/assistant/chat` |
| Tags | `/api/tags` |
| Google Calendar | `/api/google-calendar/{connect,callback,status,sync,disconnect}` |
| Utility | `/api/health` (no auth) |

Every endpoint is documented in [docs/api/reference.md](../../docs/api/reference.md).

## Testing

The suite in `src/__tests__/` has 43 files and 789 tests (run of 2026-10-11): integration tests that call the real Express app with Supertest against the database in `.env`, and unit tests for pure logic such as expressions, automation conditions and the read-retry policy. Each file creates and deletes its own test user.

```bash
# Run all tests
npm run test --workspace=backend

# Run one area (matches file names)
npm run test --workspace=backend -- automation

# Run with coverage
npm run test:coverage --workspace=backend
```

See [Testing](../../docs/testing/strategy.md) for the strategy, policy and coverage.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled output from `dist/` |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run test` | Run Vitest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with a coverage report |
