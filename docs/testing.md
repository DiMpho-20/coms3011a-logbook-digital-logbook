# Testing

This page documents how the Digital Logbook is tested: our test stack and
why we chose it, what is covered by automated tests, the formal user
feedback process, our testing policy, and proof of passing runs.

---

## Test Stack & Why We Chose It

| Tool | Role | Why |
|---|---|---|
| **Vitest 4** | Test runner and assertion framework | Same engine that powers our frontend build tooling (Vite), so one dependency ecosystem covers the whole monorepo. Fast, ESM-native, and watch-mode works out of the box with TypeScript — no extra transpile config. |
| **Supertest** | HTTP-level request helper (backend) | Lets tests call the Express app directly (`request(app).post(...)`) without starting a real server or opening a port. We test the real HTTP layer — routing, middleware, validation, status codes, JSON bodies — not just functions. |
| **React Testing Library** | Component testing (frontend) | Tests components the way users interact with them — finding elements by placeholder text, role, and label rather than by implementation details like CSS class or component state. |
| **jsdom** | Browser environment for frontend tests | Provides a lightweight DOM inside Node.js so React components can render, fire events, and validate forms without a real browser. |
| **The real Express app** (`src/app.ts`) | System under test (backend) | The app module is exported separately from the server entry point (`src/index.ts`) precisely so tests can import it without binding port 3000. |
| **Live PostgreSQL (Neon)** | Real database (backend) | Integration tests run against the actual database the app uses, exercising real Prisma queries, real constraints (unique, cascade deletes), and real SQL aggregation. Mocking Prisma would test our mocks, not our app. |
| **otplib** | TOTP code generation in tests | The 2FA tests generate *genuinely valid* time-based codes with the same library the server uses to verify them, so the full TOTP round-trip is tested end-to-end. |

**Testing pyramid:** the backend has **integration tests** (API-level, real
database) and **unit tests** (pure functions); the frontend has **component
tests** (rendered React components with jsdom) and **unit tests** (pure
logic like saved-filter persistence).

---

## What We Test

### Backend — 100 tests across 4 files

#### 1. Core API (`api.test.ts` — 27 tests)

- Health and database connectivity
- Project CRUD: create, list, read, update, archive/unarchive, 404/409/400 error paths
- Entry fields: creation per type, listing, inclusion in project reads
- Entries: creation with/without dates, update, delete, time-summary aggregation

#### 2. Authentication & Security (`auth.test.ts` — 29 tests)

- **Registration:** happy path, duplicate email (409), weak password (400), invalid email (400)
- **Login:** valid credentials return a JWT; wrong password and unknown email both return the *identical* error (no account enumeration); unverified accounts blocked with 403
- **Route protection:** missing token → 401, invalid token → 401
- **2FA full lifecycle, in order:** status check → setup (secret + QR data URL) → wrong code rejected → valid code enables → already-enabled rejected → login returns `requiresTwoFactor` with *no* token → `/login/2fa` rejects bad code, accepts valid code and issues JWT, rejects malformed code → disable rejects wrong password → disable with correct password → login back to normal
- **Password reset:** anti-enumeration behaviour (same message for known and unknown emails), invalid token rejected (400), full end-to-end reset (old password stops working, new one works, all reset tokens consumed)
- **Account deletion:** wrong password rejected; correct password permanently erases the user

#### 3. Sprint 2 Features (`sprint2.test.ts` — 22 tests)

- **Entry status tracking (US13):** default `OPEN`, mark `DONE` sets `completedAt`, reopening clears it, invalid status → 400, unknown entry → 404, `?status=` filter (Open Work view), `?dueBefore=` filter (overdue buckets)
- **Field statistics (US11):** `sum`, `avg`, and `count` aggregations with *verified arithmetic* (60 + 45 + 90 = 195, avg = 65), group-by with per-group values and descending order, all validation errors (missing field, bad operation, non-NUMBER metric, unknown fields)
- **Timeline statistics (US11/US12):** day and month bucketing with verified counts, ascending date order, invalid bucket / non-DATE field / unknown field errors

#### 4. Backend Utilities (`utils.test.ts` — 22 tests)

- **calculateComputedValues (7):** empty fields, simple addition, nested parentheses, missing values default to 0, invalid formula characters throw, non-finite result throws, computed-to-computed references
- **validateFormula (5):** valid numeric references, constants and operators, non-numeric field rejected, unknown field rejected, invalid characters rejected
- **Auth utils (7):** bcrypt hashPassword round-trip, comparePassword match and mismatch, JWT generation, extraction, invalid-token rejection, tampered-token rejection
- **createFormatVersion (3):** version 1 from scratch, increment from latest, archived fields excluded from snapshot

### Frontend — 51 tests across 7 files

#### 5. API Client (`client.test.ts` — 10 tests)

- **401 interceptor — protected routes:** clears session and redirects to `/login?expired=1`; does NOT redirect if already on `/login`
- **401 interceptor — credential routes (excluded):** leaves session intact for `/auth/login`, `/auth/login/2fa`, `/auth/account`, `/auth/2fa/disable`
- **Non-401 errors:** does not clear session on 500 or 404
- **Request interceptor:** attaches stored token to outgoing requests; omits header when no token is stored

#### 6. Saved Filters (`savedFilters.test.ts` — 12 tests)

- **loadSavedFilters (4):** empty localStorage, invalid JSON, non-array value, valid data
- **persistSavedFilters (1):** writes JSON under the correct key
- **saveFilter (4):** adds new filter, trims name, preserves existing, persists to localStorage
- **deleteFilter (3):** removes matching filter, leaves others intact, persists deletion

#### 7. Protected Route (`ProtectedRoute.test.tsx` — 3 tests)

- Redirects to `/login` when no token is stored
- Renders children when a token is present
- Renders wrapped children directly when passed via the children prop

#### 8. Entry Form (`EntryForm.test.tsx` — 8 tests)

- Renders duration input, submit button, and project selector (hidden when preset)
- Renders dynamic fields from the fields prop
- Shows validation errors for missing duration and empty required fields
- Calls createEntry and onSave on successful submission
- Renders the stopwatch component

#### 9. Login Page (`LoginPage.test.tsx` — 5 tests)

- Renders session-expired banner when URL has `?expired=1`; does NOT render on plain `/login`
- Renders email, password fields, and submit button
- Shows validation error for malformed email and empty password

#### 10. Register Page (`RegisterPage.test.tsx` — 7 tests)

- Renders full name, email, password fields and Create Account button
- Renders link to sign in for existing users
- Client-side validation: short full name, short password, invalid email, password without uppercase

#### 11. Dashboard Page (`DashboardPage.test.tsx` — 6 tests)

- Renders greeting with user's name
- Renders stat cards, New Entry and New Project buttons, Activity chart, Current Projects sections
- Shows "No active projects" when all projects are archived

Test files live in `apps/backend/src/__tests__/` and
`apps/frontend/src/**/__tests__/` in the repository.

---

## How the Tests Work

**Backend API test** — a real HTTP request to the real Express app backed by the real database:

```ts
it("PATCH /entries/:id/status marks entry DONE and sets completedAt", async () => {
  const res = await request(app)          // real Express app, no port
    .patch(`/api/entries/${statusEntryId}/status`)
    .set(H)                                // Authorization: Bearer <real JWT>
    .send({ status: "DONE" });

  expect(res.status).toBe(200);
  expect(res.body.status).toBe("DONE");
  expect(res.body.completedAt).not.toBeNull();
});
```

**Frontend component test** — renders the real React component in jsdom and asserts on DOM output:

```ts
it("renders the session-expired banner when the URL has ?expired=1", () => {
  window.history.pushState({}, "", "/login?expired=1");
  renderLoginPage();
  expect(screen.getByText(/session expired/i)).toBeInTheDocument();
});
```

**Backend unit test** — exercises pure functions directly:

```ts
it("verifyToken returns null for a tampered token", () => {
  const token = generateToken("user-1");
  const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
  expect(verifyToken(tampered)).toBeNull();
});
```

**Shared conventions across test files:**

- **Own user per file** (backend). Each suite creates its own test user (unique UUID + timestamped email), so suites never collide even though Vitest runs test files in parallel.
- **Setup in `beforeAll`, cleanup via cascade** (backend). Fixed data is created once; `afterAll` deletes the test user and every foreign key is `ON DELETE CASCADE`.
- **Sequential within a suite** where one test's output feeds the next (the 2FA lifecycle).
- **API modules mocked at the boundary** (frontend). Frontend component tests mock `../api` so they test the UI layer in isolation from the backend.
- **15s per-test timeout** for backend tests — the database is remote (Neon), so round-trips cost ~500ms each.

---

## How to Run Them

```bash
# Backend tests (from the repository root)
npm run test --workspace=apps/backend

# Frontend tests
npm run test --workspace=apps/frontend

# Watch mode (re-runs on file changes)
npm run test:watch --workspace=apps/backend
npm run test:watch --workspace=apps/frontend
```

Backend prerequisites: a reachable `DATABASE_URL` in `apps/backend/.env` and a
regenerated Prisma client (`npx prisma generate` in `apps/backend` — see
[Bugs Found By Testing](#bugs-found-by-testing)).

> **Email behaviour in tests:** with no SMTP credentials configured,
> registration auto-verifies (dev mode) and password-reset emails fail
> silently — both are caught and logged, and the endpoints still behave
> correctly. The tests assert the HTTP contract, never the email delivery.

---

## Coverage

Coverage is measured with Vitest's V8 provider, configured in
`apps/backend/vitest.config.ts` and in the `test.coverage` block of
`apps/frontend/vite.config.ts`.

```bash
# Backend coverage (needs the same DATABASE_URL as the ordinary run)
npm run test:coverage --workspace=apps/backend

# Frontend coverage
npm run test:coverage --workspace=apps/frontend
```

Each run prints a summary table to the terminal and writes
`lcov.info` to `<workspace>/coverage/`, which most editors and coverage
viewers read directly. The `coverage/` directories are gitignored; the
numbers belong in CI output and in this document, not in the repository.

Both suites are configured with `include: ["src/**"]`. Vitest 4 removed the
older `coverage.all` option, and without naming the sources explicitly a file
that no test touches is simply absent from the report rather than counted as
zero. Listing them keeps the percentage honest: it is coverage of the codebase,
not coverage of the files that happen to have tests. Test files and the
frontend's `test-setup.ts` and `main.tsx` are excluded, since measuring the
tests against themselves says nothing.

### In CI

`.gitea/workflows/deploy.yaml` runs `test:coverage` rather than `test` for both
workspaces on every push to `main`, `master`, `Alondwe` and `Dineo`. The text
reporter puts the coverage table directly into the Actions log, so the numbers
can be read from a run without downloading anything, and the two `lcov.info`
files are uploaded as a `coverage-lcov` artifact.

The upload step is pinned to `actions/upload-artifact@v3` and marked
`continue-on-error`. Version 4 of that action depends on an artifact backend
that not every Gitea runner provides, and a runner without artifact storage
should not fail an otherwise green build — the coverage table is in the log
regardless.

### Coverage on the commit

Gitea 1.24 has no built-in coverage display of the kind GitLab offers, so the
workflow publishes the figure itself. `.gitea/scripts/report-coverage.mjs`
reads the `coverage-summary.json` each workspace writes and posts three commit
statuses through the Gitea API: `coverage/backend`, `coverage/frontend` and
`coverage/combined`, each described as a line percentage and linking back to
the run that produced it. They appear on the commit in the Gitea UI, so the
number is visible per commit with no manual step.

The combined status is the one the marking rubric is judged on, which is why it
is published rather than left for a reader to work out from the other two.

The script is Node rather than shell because `jq` and `curl` are not guaranteed
on a self-hosted runner while Node is, `setup-node` having already run. It
never fails the build: a missing summary, a missing token, a rejected request
and an unreachable host are all logged and exited cleanly, and the step is
additionally marked `continue-on-error`. Publishing a number is not worth
turning a green run red.

It also appends the same table to `$GITHUB_STEP_SUMMARY`, which renders on the
run page for runners that support summaries and is ignored by those that do not.

If the statuses do not appear, the log will say why — the likeliest cause is
the runner's injected token lacking permission to write statuses, in which case
a repository secret holding a token with write access can be passed to the step
instead.

No coverage thresholds are enforced yet. The purpose at this stage is to publish
the numbers and watch them move; a threshold set before anyone has seen a
baseline is an arbitrary number that either passes trivially or blocks work for
no reason. Once a few runs have established where the project actually sits, a
floor at or slightly below the current figure is worth adding, so coverage can
only go up.

---

## Testing Policy

1. **Every API endpoint gets tests for the happy path *and* its error paths** (400 validation, 401 auth, 404 missing, 409 conflict). If an endpoint has no error-path test, it isn't done.
2. **Never mock what we're testing** at the integration level. No Prisma mocks, no stub auth. The database is real; failures must be real failures. Unit tests for pure functions may use mocks for external dependencies.
3. **Security behaviour is tested as behaviour, not implementation** — e.g. we assert that unknown-email and wrong-password logins return byte-identical errors, not that some flag was set.
4. **Tests must clean up after themselves** via user-cascade deletion, so the shared database stays usable.
5. **Regression rule:** any bug found (see below) gets a test that would have caught it before the fix is considered done.
6. **Tests run in CI before every merge to main** — a red suite blocks the merge. The Gitea Actions workflow runs both backend and frontend test suites on every push to protected branches.

---

## User Feedback Process

Automated testing checks what the code *does*; user feedback checks
whether it *works for real users*. Our formal process:

1. **Instrument:** a standard **SUS (System Usability Scale)** questionnaire
   — 10 fixed Likert items, scored 0–100 — so results are quantifiable and
   comparable across rounds.
2. **Scenario-based sessions:** each tester gets the same set of task
   scenarios (register → create project → add entry → mark done → view
   stats/calendar → enable 2FA). We record pass/fail per task and where
   testers hesitate.
3. **Recruitment:** 5–8 testers per round — classmates, other teams, and
   our client.
4. **Analysis & integration:** SUS scores and task failures are reviewed as
   a team; each actionable finding becomes an issue on the tracker with an
   assigned fix, and fixed items are reported back in the next round.
5. **Records:** each round is logged in `docs/user-feedback.md` with the
   raw scores, findings, and the feedback → action → commit trail.

The first formal round is scheduled for Sprint 2; results will be
published on this site.

---

## Proof of Passing Runs

**Run date: 2026-09-15 · 151 / 151 tests passing · 11 / 11 test files passing**

### Backend (100 tests, 4 files)

```text
 ✓ src/__tests__/utils.test.ts (22 tests)
     ✓ calculateComputedValues > returns an empty object when there are no COMPUTED fields
     ✓ calculateComputedValues > evaluates a simple addition formula
     ✓ calculateComputedValues > evaluates nested expressions with parentheses
     ✓ calculateComputedValues > defaults missing values to 0
     ✓ calculateComputedValues > throws on invalid formula characters
     ✓ calculateComputedValues > throws when formula result is not finite
     ✓ calculateComputedValues > allows computed fields to reference other computed fields
     ✓ validateFormula > accepts a valid formula referencing numeric fields
     ✓ validateFormula > accepts a formula with constants and operators
     ✓ validateFormula > rejects a formula that references a non-numeric field
     ✓ validateFormula > rejects a formula that references an unknown field
     ✓ validateFormula > rejects a formula with invalid characters
     ✓ auth utils > hashPassword returns a bcrypt hash string
     ✓ auth utils > comparePassword returns true for matching password
     ✓ auth utils > comparePassword returns false for wrong password
     ✓ auth utils > generateToken produces a valid JWT string
     ✓ auth utils > verifyToken extracts the userId from a valid token
     ✓ auth utils > verifyToken returns null for an invalid token
     ✓ auth utils > verifyToken returns null for a tampered token
     ✓ createFormatVersion > creates version 1 when no previous versions exist
     ✓ createFormatVersion > increments version from the latest
     ✓ createFormatVersion > excludes archived fields from the snapshot

 ✓ src/__tests__/api.test.ts (27 tests)
     ✓ Health endpoints > GET /api/health returns ok
     ✓ Health endpoints > GET /api/db-check connects to database
     ✓ Projects CRUD > POST /api/projects creates a project
     ✓ Projects CRUD > POST /api/projects rejects duplicate name → 409
     ✓ Projects CRUD > POST /api/projects rejects missing name → 400
     ✓ Projects CRUD > GET /api/projects lists user projects
     ✓ Projects CRUD > GET /api/projects/:id returns project with entryFields
     ✓ Projects CRUD > GET /api/projects/:id returns 404 for unknown id
     ✓ Projects CRUD > PUT /api/projects/:id updates the project
     ✓ Projects CRUD > PUT /api/projects/:id rejects rename to duplicate → 409
     ✓ Projects CRUD > PATCH /api/projects/:id/status toggles to ARCHIVED
     ✓ Projects CRUD > PATCH /api/projects/:id/status toggles back to ACTIVE
     ✓ Projects CRUD > PATCH /api/projects/:id/status rejects invalid status → 400
     ✓ Projects CRUD > GET /api/projects/:id/time-summary returns zero for new project
     ✓ Entry Fields CRUD > POST /api/projects/:id/entry-fields creates a field
     ✓ Entry Fields CRUD > POST creates a NUMBER field
     ✓ Entry Fields CRUD > GET /api/projects/:id/entry-fields lists fields
     ✓ Entry Fields CRUD > GET /api/projects/:id now includes the created fields
     ✓ Entries CRUD > POST /api/projects/:id/entries creates an entry with values
     ✓ Entries CRUD > POST creates entry without optional dates
     ✓ Entries CRUD > GET /api/projects/:id/entries lists entries
     ✓ Entries CRUD > PUT /api/entries/:id updates duration and values
     ✓ Entries CRUD > PUT /api/entries/:id updates dates
     ✓ Entries CRUD > GET /api/projects/:id/time-summary reflects entries
     ✓ Entries CRUD > DELETE /api/entries/:id deletes the entry
     ✓ Entries CRUD > DELETE /api/entries/:id returns 404 for unknown id
     ✓ Cleanup > deletes test project and cascades all related data

 ✓ src/__tests__/auth.test.ts (29 tests)
     ✓ Registration > POST /auth/register creates a user → 201
     ✓ Registration > POST /auth/register rejects duplicate email → 409
     ✓ Registration > POST /auth/register rejects a weak password → 400
     ✓ Registration > POST /auth/register rejects an invalid email → 400
     ✓ Login > POST /auth/login returns a JWT for valid credentials
     ✓ Login > POST /auth/login rejects a wrong password → 401
     ✓ Login > POST /auth/login rejects an unknown email → 401 (same message)
     ✓ Login > POST /auth/login blocks unverified accounts → 403
     ✓ Auth middleware > rejects requests without a token → 401
     ✓ Auth middleware > rejects requests with an invalid token → 401
     ✓ 2FA lifecycle > reports 2FA disabled initially
     ✓ 2FA lifecycle > POST /2fa/setup returns a secret and QR code
     ✓ 2FA lifecycle > POST /2fa/verify-setup rejects an incorrect code → 400
     ✓ 2FA lifecycle > POST /2fa/verify-setup accepts a valid code and enables 2FA
     ✓ 2FA lifecycle > reports 2FA enabled after verification
     ✓ 2FA lifecycle > POST /2fa/setup rejects when already enabled → 400
     ✓ 2FA lifecycle > login with 2FA enabled returns requiresTwoFactor and no token
     ✓ 2FA lifecycle > POST /login/2fa rejects an invalid code → 401
     ✓ 2FA lifecycle > POST /login/2fa accepts a valid code and issues a JWT
     ✓ 2FA lifecycle > POST /login/2fa rejects a malformed code → 400
     ✓ 2FA lifecycle > POST /2fa/disable rejects a wrong password → 401
     ✓ 2FA lifecycle > POST /2fa/disable with correct password disables 2FA
     ✓ 2FA lifecycle > login works normally again after 2FA is disabled
     ✓ Password reset > POST /forgot-password returns the same message for unknown emails
     ✓ Password reset > POST /forgot-password returns the same message for real emails
     ✓ Password reset > POST /reset-password rejects an invalid token → 400
     ✓ Password reset > resets the password end-to-end with a valid token
     ✓ Account deletion > DELETE /auth/account rejects a wrong password → 401
     ✓ Account deletion > DELETE /auth/account with correct password erases the account

 ✓ src/__tests__/sprint2.test.ts (22 tests)
     ✓ Entry status tracking > creates an entry with default OPEN status
     ✓ Entry status tracking > PATCH /entries/:id/status marks entry DONE and sets completedAt
     ✓ Entry status tracking > PATCH /entries/:id/status back to OPEN clears completedAt
     ✓ Entry status tracking > PATCH /entries/:id/status rejects invalid status → 400
     ✓ Entry status tracking > PATCH /entries/:id/status returns 404 for unknown id
     ✓ Entry status tracking > GET entries supports ?status= filter (open work view)
     ✓ Entry status tracking > GET entries supports ?dueBefore= filter (overdue buckets)
     ✓ Stats grouping > sums a NUMBER field across entries
     ✓ Stats grouping > averages a NUMBER field
     ✓ Stats grouping > counts entries with a TEXT metric field
     ✓ Stats grouping > groups a NUMBER metric by a TEXT field
     ✓ Stats grouping > rejects missing metricFieldId → 400
     ✓ Stats grouping > rejects an unsupported operation → 400
     ✓ Stats grouping > rejects sum on a non-NUMBER field → 400
     ✓ Stats grouping > returns 404 for an unknown metric field
     ✓ Stats grouping > returns 404 for an unknown group-by field
     ✓ Stats timeline > buckets entry counts by day using a DATE field
     ✓ Stats timeline > supports month bucketing
     ✓ Stats timeline > rejects an invalid bucket → 400
     ✓ Stats timeline > rejects a non-DATE field → 400
     ✓ Stats timeline > rejects a missing dateFieldId → 400
     ✓ Stats timeline > returns 404 for an unknown date field

 Test Files  4 passed (4)
      Tests  100 passed (100)
   Duration  90.55s
```

### Frontend (51 tests, 7 files)

```text
 ✓ src/lib/__tests__/savedFilters.test.ts (12 tests)
 ✓ src/components/__tests__/ProtectedRoute.test.tsx (3 tests)
 ✓ src/components/__tests__/EntryForm.test.tsx (8 tests)
 ✓ src/pages/__tests__/DashboardPage.test.tsx (6 tests)
 ✓ src/api/__tests__/client.test.ts (10 tests)
 ✓ src/pages/__tests__/RegisterPage.test.tsx (7 tests)
 ✓ src/pages/__tests__/LoginPage.test.tsx (5 tests)

 Test Files  7 passed (7)
      Tests  51 passed (51)
   Duration  44.77s
```

---

## Bugs Found By Testing

Writing these tests surfaced two real issues — this is the regression rule
in action:

1. **Stale Prisma client broke every entry-creation test (11 pre-existing
   failures).** The generated client predated the Sprint 2 schema, so any
   query touching `entry_fields.archived_at` threw
   `PrismaClientValidationError: Unknown argument archivedAt`. Fix: run
   `npx prisma generate` after pulling schema changes. *Lesson:
   `prisma generate` belongs in postinstall/CI.*

2. **Concurrent entry-field creation can race on format versioning.**
   Each field create does read-latest-version → insert latest+1. Two
   parallel creates both read version *N* and both try to insert *N+1*;
   the unique `(project_id, version)` constraint rejects one, so one field
   creation fails with 400. Tests create fields sequentially (matching
   real UI usage). *Fix candidate: wrap version bump in a transaction
   with a retry, or use `MAX(version)+1` inside a serializable
   transaction.* Both are filed on the issue tracker.

---

## Future Work

- **Test isolation:** move to a per-run schema or transaction-rollback strategy so backend suites can't observe each other's data at all.
- **Rate-limiting tests** once auth rate limiting is implemented.

### Completed

- **CI gate** — the Gitea Actions workflow now runs both backend and frontend test suites on every push to protected branches (main, Dineo, Alondwe, Wendy).
- **Backend unit tests** — 22 utils tests cover computedFields, auth, and entryFormat.
- **Frontend component and UI tests** — 51 tests across 7 files cover saved-filter persistence, the 401 session-clearing interceptor, ProtectedRoute redirects, LoginPage/RegisterPage/DashboardPage validation and rendering, and EntryForm behaviour.

---

*Related: [Third-Party Code](third-party.md) documents the testing
libraries and their licences, and [Database Design](design/database-erd.md)
describes the schema the integration tests run against.*
