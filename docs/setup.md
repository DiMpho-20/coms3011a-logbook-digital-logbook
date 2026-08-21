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
# Required — PostgreSQL connection string (from Neon dashboard)
DATABASE_URL="postgresql://<user>:<password>@<host>/<dbname>?sslmode=require"

# Required — secret key for signing JWT auth tokens
JWT_SECRET=your-random-secret-string-here

# Backend port (default: 3000)
PORT=3000

# Frontend URL (used in verification/reset email links)
APP_URL=http://localhost:5173

# Optional — Gmail SMTP for email verification and password reset
# Without these, accounts are auto-verified in dev mode (no email sent)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

> **Tip:** To get a Gmail App Password: go to [Google Account](https://myaccount.google.com) → Security → enable 2-Step Verification → App Passwords → create one for "Mail".

> **Warning:** Never commit `.env` files with real credentials to the repository.

### 5. Set up the database schema

Generate the Prisma client and push the schema to your Neon database:

```bash
npx prisma generate --schema=apps/backend/prisma/schema.prisma
npx prisma db push --schema=apps/backend/prisma/schema.prisma
```

> This creates all tables (`users`, `projects`, `entry_fields`, `entries`, `password_resets`) in your Neon database. Use `--force-reset` if you need to clear existing data during development.

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
| `npm run lint` | `apps/backend` | Run ESLint |

## Code Quality & Linting

Before committing code or opening a Pull Request, always ensure the code passes the workspace linter:

```bash
npm run lint --workspace=backend
```

And passes the type checker:

```bash
npm run typecheck --workspace=backend
```

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
2. Regenerate the Prisma client if the schema changed: `npx prisma generate --schema=apps/backend/prisma/schema.prisma`

## Authentication & Email

The app uses JWT-based authentication with email verification:

* **Registration** creates a user with an unverified email
* **Email verification** — a verification link is sent via Gmail SMTP (if configured)
* **Login** is blocked until the email is verified
* **Password reset** — reset link sent via email

**Dev mode (no Gmail credentials):** accounts are automatically verified so you can develop without email setup. The verification link is logged to the backend console.

**Production mode:** set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env` to enable real email sending.
