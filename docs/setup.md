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

Create `apps/backend/.env` with your Neon database URL:

```env
DATABASE_URL="postgresql://<user>:<password>@<host>/<dbname>?sslmode=require"
```

> **Note:** The backend also requires a `PORT` variable if you want a non-default port. Default is `3000`.

### 5. Set up the database schema

Generate the Prisma client (required before first run and after any schema changes):

```bash
npx prisma generate --schema=apps/backend/prisma/schema.prisma
```

To apply schema migrations to the database:

```bash
npx prisma db push --schema=apps/backend/prisma/schema.prisma
```

### 6. Run development servers

**Backend** (Express API on port 3000):

```bash
npm run dev --workspace=backend
```

**Frontend** (Vite dev server on port 5173):

```bash
npm run dev --workspace=frontend
```

The frontend proxies `/api/*` requests to the backend at `http://localhost:3000`.

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

The backend includes 27 integration tests using Vitest and Supertest that exercise all API endpoints against the live Neon database.

```bash
# Run tests once
npm run test --workspace=backend

# Run tests in watch mode
npm run test:watch --workspace=backend
```

Tests are located in `apps/backend/src/__tests__/api.test.ts`.

## Shared Types Package

The `@logbook/shared` package (in `packages/shared/`) contains TypeScript interfaces shared between frontend and backend. It is referenced via npm workspace linking (`"@logbook/shared": "*"`). After modifying shared types, regenerate the Prisma client and restart both servers.
