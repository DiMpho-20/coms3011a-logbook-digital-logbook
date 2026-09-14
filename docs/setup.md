# Development Setup Guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | v22+ | Use `nvm` (recommended) |
| npm | v10+ | Ships with Node.js |
| nvm | latest | Optional, manages Node versions |
| PostgreSQL | — | Hosted on [Neon](https://neon.tech) — no local install needed |

## Quickstart

### 1. Clone the repository

```bash
git clone https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook.git
cd coms3011a-logbook-digital-logbook
```

### 2. Set the Node version

```bash
nvm use
```

### 3. Install dependencies

From the repository root (installs all workspace packages):

```bash
npm install
```

### 4. Configure environment variables

Create `apps/backend/.env` from the example file:

```bash
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env` and set the following variables:

```env
# Get your connection string from the Neon dashboard → Connection Details.
# It contains your database password — treat it as a secret and never commit it.
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require

PORT=3000
APP_URL=http://localhost:5173
```

> **Warning:** Never commit `.env` files with real credentials to the repository, and never paste real connection strings into documentation — the docs site is publicly accessible.

### 5. Set up the database schema

The backend uses Prisma 7 with a `prisma.config.ts` file that reads the `DATABASE_URL` from your `.env`. All Prisma commands must be run from inside the `apps/backend/` directory:

```bash
cd apps/backend
npx prisma generate
npx prisma db push
```

> This creates all tables (`users`, `projects`, `entry_fields`, `entries`, `password_resets`) in your Neon database. Use `npx prisma db push --force-reset` if you need to clear existing data during development.

### 6. Run development servers

You need **both** servers running simultaneously:

**Terminal 1 — Backend** (Express API on port 3000):

```bash
npm run dev --workspace=backend
```

**Terminal 2 — Frontend** (Vite dev server on port 5173):

```bash
npm run dev --workspace=frontend
```

The frontend proxies `/api/*` requests to `http://localhost:3000` via the Vite config.

Open <http://localhost:5173> in your browser to use the app.

> **Note:** Both servers must be running. Without the backend, all API calls return a `502 Bad Gateway`.

## Project Scripts

| Command | Location | Description |
|---|---|---|
| `npm run dev` | `apps/backend` | Start backend with hot reload (`tsx watch`) |
| `npm run dev` | `apps/frontend` | Start Vite dev server |
| `npm run typecheck` | `apps/backend` | Run `tsc --noEmit` |
| `npm run test` | `apps/backend` | Run Vitest integration tests |
| `npm run test:watch` | `apps/backend` | Run tests in watch mode |
| `npm run build` | `apps/backend` | Compile TypeScript to `dist/` |
| `npm run lint` | `apps/frontend` | Run oxlint |

## Code Quality & Linting

The frontend uses [oxlint](https://oxc.rs) for fast linting:

```bash
npm run lint --workspace=frontend
```

The backend uses TypeScript's built-in type checker. Run it before committing:

```bash
npm run typecheck --workspace=backend
```

> **Note:** The backend does not have a separate `lint` script. The root-level `npm run lint` command uses `--if-present`, so it will skip the backend gracefully.

## Testing

The backend includes 27 integration tests using Vitest and Supertest that exercise all API endpoints (projects, entries, entry fields) against the live Neon database.

```bash
# Run all tests
npm run test --workspace=backend

# Run tests in watch mode
npm run test:watch --workspace=backend
```

Tests are located in `apps/backend/src/__tests__/api.test.ts`.

## Shared Types Package

The `@logbook/shared` package (`packages/shared/`) contains TypeScript interfaces, Zod validation schemas, and types shared between frontend and backend. It is linked via npm workspaces (`"@logbook/shared": "*"`).

After modifying shared types:
1. Restart both dev servers
2. Regenerate the Prisma client if the schema changed: run `npx prisma generate` from `apps/backend/`

## Authentication & Email

The app uses JWT-based authentication with email verification and optional two-factor authentication (2FA):

* **Registration** creates a user with an unverified email
* **Email verification** — a verification link is sent via Gmail SMTP (if configured)
* **Login** is blocked until the email is verified
* **Password reset** — reset link sent via email
* **Two-factor authentication (2FA)** — TOTP-based 2FA using `otplib`. Users can enable/disable 2FA in Settings. When enabled, a QR code is generated for authenticator app setup.

**Dev mode (no Gmail credentials):** accounts are automatically verified so you can develop without email setup. The verification link is logged to the backend console.

**Production mode:** set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env` to enable real email sending.

## Commit Convention

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <description>

[optional body]
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
