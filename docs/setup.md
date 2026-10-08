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

Then build the shared package once:

```bash
npm run build --workspace=packages/shared
```

`@logbook/shared` ships compiled JavaScript and declarations rather than
TypeScript source, and the backend resolves it through `packages/shared/dist`.
Until it is built, the backend fails to start with
`Cannot find module '…/node_modules/@logbook/shared/dist/index.js'`. Re-run it
after changing anything in `packages/shared/src`, or the backend keeps using the
old build. (The frontend reads `packages/shared/src` directly through an alias in
`vite.config.ts`, so it does not need the build.)

### 4. Configure environment variables

Create `apps/backend/.env` from the example file:

```bash
cp apps/backend/.env.example apps/backend/.env
```

Then edit `apps/backend/.env`. The example is a template, not working values:
**delete or blank every placeholder you are not replacing with a real value.**
A leftover placeholder such as `RESEND_API_KEY=re_xxxxxxxxxxxxx` makes the
backend believe email is configured, so new accounts are no longer
auto-verified and cannot sign in.

**Required for local development:**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string (Neon dashboard → Connection Details). Contains the database password. |
| `PORT` | Backend port, normally `3000` (the Vite proxy expects it). |
| `APP_URL` | Frontend URL, `http://localhost:5173` locally. Used in email links and the Google Calendar redirect. |
| `JWT_SECRET` | Signs login tokens. Optional locally, but without it the backend generates a new secret on every start, so **every restart signs you out**. Required in production, where the server refuses to start without it. |

Generate any secret in this guide with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Optional, per feature:** leave these unset and the feature is simply off.

| Variable(s) | Feature | Without it |
|---|---|---|
| `RESEND_API_KEY`, `RESEND_FROM` | Email via [Resend](https://resend.com) (recommended) | Accounts are auto-verified; links are logged to the backend console |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email via Gmail SMTP (used only when Resend is not set) | As above |
| `TWO_FACTOR_ENCRYPTION_KEY` | Encrypts 2FA secrets | Enabling 2FA returns `503`. Never change it once set: existing 2FA users would be locked out |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` | Google Calendar sync | The Calendar page reports that Google Calendar is not configured |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (and optionally `VAPID_SUBJECT`) | Push notifications for reminders (see [Push notifications](#push-notifications)) | Reminders stay in-app only; the backend logs `VAPID keys not set` on start |
| `RATE_LIMIT_*`, `RATE_LIMIT_DISABLED`, `TRUST_PROXY_HOPS` | Rate-limit tuning | Sensible defaults apply; see the comments in `.env.example` |

> **Warning:** Never commit `.env` files with real credentials to the repository, and never paste real connection strings or keys into documentation — the docs site is publicly accessible. `.env` is already listed in `.gitignore`.

### 5. Set up the database schema

The backend uses Prisma 7 with a `prisma.config.ts` file that reads the `DATABASE_URL` from your `.env`. All Prisma commands must be run from inside the `apps/backend/` directory:

```bash
cd apps/backend
npx prisma generate
npx prisma migrate deploy
```

> The migration history was squashed on 2026-09-27 into a baseline, `prisma/migrations/0_init`, which creates the core schema (eighteen tables, enums, unique indexes and foreign keys) on an empty database. Dated migrations after it add the rest — push subscriptions, dashboard layouts, and unique entry-field names — for twenty tables in all. `npx prisma migrate deploy` applies them in order, so it bootstraps a fresh Neon project end-to-end; there is no need for `prisma db push`, and new schema changes should arrive as dated migrations (`npx prisma migrate dev --name <change>`).

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

> **Note:** Both servers must be running. Without the backend, the Vite terminal logs `http proxy error: /api/… ECONNREFUSED` and every request fails — see [Troubleshooting](#troubleshooting).

When the backend starts you will see a `SECURITY WARNING` from `pg` about SSL modes. It is harmless; changing `sslmode=require` to `sslmode=verify-full` in `DATABASE_URL` silences it without changing behaviour.

## Project Scripts

| Command | Location | Description |
|---|---|---|
| `npm run dev` | `apps/backend` | Start backend with hot reload (`tsx watch`) |
| `npm run build` | `apps/backend` | Compile TypeScript to `dist/` |
| `npm run start` | `apps/backend` | Run the compiled backend (`dist/index.js`) |
| `npm run typecheck` | `apps/backend` | Run `tsc --noEmit` |
| `npm run test` | `apps/backend` | Run the Vitest suite (against the database in `.env`) |
| `npm run test:watch` | `apps/backend` | Run tests in watch mode |
| `npm run test:coverage` | `apps/backend` | Run tests with a coverage report |
| `npm run build` | `packages/shared` | Compile the shared package to `dist/` |
| `npm run dev` | `apps/frontend` | Start Vite dev server |
| `npm run build` | `apps/frontend` | Type-check and build the production bundle to `dist/` |
| `npm run preview` | `apps/frontend` | Serve the production build locally |
| `npm run test` | `apps/frontend` | Run the Vitest + Testing Library suite (jsdom, no backend needed) |
| `npm run test:watch` | `apps/frontend` | Run tests in watch mode |
| `npm run test:coverage` | `apps/frontend` | Run tests with a coverage report |
| `npm run lint` | every workspace | Run each workspace's linter (oxlint for the frontend, ESLint for the backend) |

## Code Quality & Linting

The frontend uses [oxlint](https://oxc.rs) for fast linting:

```bash
npm run lint --workspace=frontend
```

The backend uses [ESLint](https://eslint.org) with typescript-eslint:

```bash
npm run lint --workspace=backend
```

Every rule is an error except `@typescript-eslint/no-explicit-any`, which is
a warning on purpose: the backend handles untyped Prisma rows and raw SQL at
a handful of boundaries, and failing every build over those would train the
team to ignore the linter. The type checker still runs alongside it:

```bash
npm run typecheck --workspace=backend
```

Both linters run in CI on every push (see the pipeline below), so a rule
violation fails the build rather than relying on someone remembering to run
the command before pushing.

## Testing

Both apps use [Vitest](https://vitest.dev).

* **Backend** (`apps/backend/src/__tests__/`): integration tests using Supertest, one file per area (auth, entries, statistics, reminders, push, automation rules and so on). They run against the database in `apps/backend/.env`, so that file must be set up first.
* **Frontend** (`apps/frontend/src/**/__tests__/`): component, page and library tests using Testing Library in jsdom. They mock the API and need no backend.

```bash
# Run all tests
npm run test --workspace=backend
npm run test --workspace=frontend

# Run one area only (matches file names)
npm run test --workspace=backend -- automation

# Run tests in watch mode
npm run test:watch --workspace=backend
```

See [Testing](testing.md) for the test strategy.

## Shared Types Package

The `@logbook/shared` package (`packages/shared/`) contains TypeScript interfaces, Zod validation schemas, and types shared between frontend and backend. It is linked via npm workspaces (`"@logbook/shared": "*"`).

After modifying shared types:
1. Rebuild the package: `npm run build --workspace=packages/shared`
2. Restart both dev servers

After changing `apps/backend/prisma/schema.prisma`, regenerate the Prisma client with `npx prisma generate` from `apps/backend/`.

## Authentication & Email

The app uses JWT-based authentication with email verification and optional two-factor authentication (2FA):

* **Registration** creates a user with an unverified email
* **Email verification** — a verification link is sent by email (if configured)
* **Login** is blocked until the email is verified
* **Password reset** — reset link sent via email
* **Two-factor authentication (2FA)** — TOTP-based 2FA using `otplib`, with recovery codes. Users can enable/disable 2FA in Settings. When enabled, a QR code is generated for authenticator app setup. Requires `TWO_FACTOR_ENCRYPTION_KEY`.

**Dev mode (no email provider):** accounts are automatically verified so you can develop without email setup. The verification link is logged to the backend console.

**Real email:** set `RESEND_API_KEY` and `RESEND_FROM` (recommended), or `GMAIL_USER` and `GMAIL_APP_PASSWORD`. If both are set, Resend is used.

## Push notifications

Reminders can notify a device even when the logbook is closed, using web push.

1. Generate a key pair once: `npx web-push generate-vapid-keys`.
2. Put the pair in `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` — the **same pair** everywhere (local `.env` and the Render environment). A browser subscribed with one public key cannot receive pushes signed with another, and changing the keys cuts off every existing subscription.
3. In the app, turn on **Settings → Reminders → Notify me on this device** and allow notifications when the browser asks. If it was already on before the keys were set, turn it off and on again.

**Push only works in a production build.** The service worker that receives pushes is registered only when `import.meta.env.PROD` is true, so under `npm run dev` the app falls back to in-app notifications: they appear only while a logbook tab is open, and the tab checks for due reminders every five minutes. Test real push against the deployed site, with the logbook tab closed but the browser still running.

If notifications never appear, check in order: the browser's site permission for notifications (`Notification.permission` in the console should be `"granted"`), the operating system's notification settings for the browser (including Do Not Disturb), and — on the deployed site — that the backend is awake, since Render's free tier sleeps when idle and pushes are only sent while it runs. On iPhone, push requires the app to be added to the home screen. Notification sound is controlled by the operating system, not the app.

## Deployment

| Part | Host | Address |
|---|---|---|
| Frontend | Cloudflare Pages | <https://coms3011a-logbook.pages.dev> |
| API | Render (Docker, from the repository `Dockerfile`) | <https://digital-logbook-backend-latest.onrender.com/api> |
| Database | Neon (PostgreSQL) | `DATABASE_URL` in the Render environment |
| Documentation | Netlify (MkDocs) | <https://no-boys-just-bugs-digital-logbook-doc.netlify.app/> |

### The pipeline (CI/CD)

`.gitea/workflows/deploy.yaml` runs on every push to `main` and the team
branches:

1. **CI** — install, build the shared package, typecheck the backend, lint the
   backend and the frontend, run both test suites with coverage (the backend
   suite against a PostgreSQL database created for that run, both suites
   gated by coverage floors), report coverage on the commit, and build both
   apps.
2. **CD** — on `main` only, and only after CI has passed:
    - the API is redeployed through a Render deploy hook;
    - the frontend is built and published to Cloudflare Pages with Wrangler;
    - the API's health check is called until it answers, so it is awake.

Each deploy step runs only once its secret exists, so the pipeline stays green
until they are added. Repository settings → Actions → Secrets:

| Secret | Where to get it |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render → the API service → Settings → Deploy Hook |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → a token with *Cloudflare Pages: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → the account ID in the sidebar |

The backend suite gets a database of its own for each run. The
`DATABASE_URL` secret is only its fallback, used (with a warning in the log)
if the runner cannot start that database.

The Cloudflare Pages project name defaults to `coms3011a-logbook`; set the
`CLOUDFLARE_PAGES_PROJECT` repository variable if it differs.

### Database migrations on deploy

The API container starts with `npm run start:deploy`, which runs
`prisma migrate deploy` before serving. A deploy therefore brings the
production schema up to date by itself; there is no separate migration step
to forget. To apply migrations by hand instead:

```bash
cd apps/backend && DATABASE_URL=<production connection string> npx prisma migrate deploy
```

### Keeping the API awake

Render's free tier sleeps after a quiet spell, and the first request then waits
up to a minute. `.gitea/workflows/keep-warm.yaml` calls `/api/health` every ten
minutes, so neither users nor markers meet that wait. It can also be run by
hand from the Actions tab.

### Required API environment (Render)

Set in the Render service's environment, as listed in `apps/backend/.env.example`:
`DATABASE_URL`, `JWT_SECRET`, `TWO_FACTOR_ENCRYPTION_KEY`, `APP_URL`, an email
provider (`RESEND_API_KEY` or Gmail), and for the integrations `GEMINI_API_KEY`
(help assistant) and `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (Google Calendar sync).
Push notifications need `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

### A demo account

For presentations and markers, `npm run seed:demo` builds an account with
realistic data — three projects with their own entry formats, seven weeks of
entries, open work (overdue, upcoming, undated), two modules with weighted
assessments, a saved statistic and a reminder:

```bash
DEMO_API_URL=https://digital-logbook-backend-latest.onrender.com/api \
DATABASE_URL=<the database that API uses> \
npm run seed:demo --workspace=apps/backend
```

Everything is created through the API, so the app's own rules apply; the
database is used once, to mark the demo account's email verified. It never
changes an existing account — if the email is taken it stops — so set
`DEMO_EMAIL` (and optionally `DEMO_PASSWORD`, `DEMO_NAME`) to make another.

### Quality evidence

Lighthouse (Chrome DevTools → Lighthouse, or `npx lighthouse <url> --view`)
reports accessibility, performance and best-practice scores. Run it on the
deployed Dashboard, Entries, My Grades and Settings pages, in both desktop and
mobile modes, and keep the reports with the submission.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Login says **"Invalid email or password."** with correct details, and the Vite terminal shows `http proxy error … ECONNREFUSED` | The backend is not running, so the frontend gets no response and falls back to that message | Start the backend (`npm run dev --workspace=backend`) and check it prints `Backend running on http://localhost:3000` |
| Backend fails with `Cannot find module '…/@logbook/shared/dist/index.js'` | The shared package has not been built | `npm run build --workspace=packages/shared`, then start the backend again |
| You are signed out every time the backend restarts; the backend logs `JWT_SECRET is not set` | No `JWT_SECRET`, so a new one is generated per process | Set `JWT_SECRET` in `apps/backend/.env` |
| New accounts cannot sign in: "Please verify your email address" | A real or placeholder email key is set, so auto-verification is off | Use the emailed link, or remove the placeholder `RESEND_*`/`GMAIL_*` values for local development |
| Enabling 2FA returns an error about an encryption key | `TWO_FACTOR_ENCRYPTION_KEY` is not set | Set it and restart the backend |
| VS Code shows "An environment file is configured but terminal environment injection is disabled" | A notice from the Python extension, unrelated to this project | Ignore it; the backend loads `.env` itself |

## Commit Convention

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <description>

[optional body]
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
