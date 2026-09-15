# Testing — Digital Logbook Backend

This document explains everything about how the Digital Logbook backend is tested: the tools we use and why, what is covered, how the tests are structured, our testing policy, and proof of successful runs.

---

## Table of Contents

1. [Test Stack & Why We Chose It](#test-stack--why-we-chose-it)
2. [What We Test](#what-we-test)
3. [Test Files & Structure](#test-files--structure)
4. [How the Tests Work](#how-the-tests-work)
5. [How to Run Them](#how-to-run-them)
6. [Testing Policy](#testing-policy)
7. [Proof of Passing Runs](#proof-of-passing-runs)
8. [Bugs Found By Testing](#bugs-found-by-testing)
9. [Future Work](#future-work)

---

## Test Stack & Why We Chose It

| Tool | Role | Why |
|---|---|---|
| **Vitest 4** | Test runner and assertion framework | Same engine that powers our frontend build tooling (Vite), so one dependency ecosystem covers the whole monorepo. Fast, ESM-native, and watch-mode works out of the box with TypeScript — no extra transpile config. |
| **Supertest** | HTTP-level request helper | Lets tests call the Express app directly (`request(app).post(...)`) without starting a real server or opening a port. We test the real HTTP layer — routing, middleware, validation, status codes, JSON bodies — not just functions. |
| **The real Express app** (`src/app.ts`) | System under test | The app module is exported separately from the server entry point (`src/index.ts`) precisely so tests can import it without binding port 3000. |
| **Live PostgreSQL (Neon)** | Real database | Integration tests run against the actual database the app uses, exercising real Prisma queries, real constraints (unique, cascade deletes), and real SQL aggregation. Mocking Prisma would test our mocks, not our app. |
| **otplib** | TOTP code generation in tests | The 2FA tests generate *genuinely valid* time-based codes with the same library the server uses to verify them, so the full TOTP round-trip is tested end-to-end. |

**Testing pyramid position:** the API tests are **integration tests** — they sit above unit tests and below end-to-end UI tests. Each test makes a real HTTP request to the real app backed by the real database, and asserts on the HTTP response. The utils tests are **unit tests** that exercise pure functions in isolation.

---

## What We Test

### 1. Core API (`api.test.ts` — 27 tests)

- Health and database connectivity
- Project CRUD: create, list, read, update, archive/unarchive, 404/409/400 error paths
- Entry fields: creation per type, listing, inclusion in project reads
- Entries: creation with/without dates, update, delete, time-summary aggregation

### 2. Authentication & Security (`auth.test.ts` — 29 tests)

- **Registration:** happy path, duplicate email (409), weak password (400), invalid email (400)
- **Login:** valid credentials return a JWT; wrong password and unknown email both return the *identical* error (no account enumeration); unverified accounts blocked with 403
- **Route protection:** missing token → 401, invalid token → 401
- **2FA full lifecycle, in order:** status check → setup (secret + QR data URL) → wrong code rejected → valid code enables → already-enabled rejected → login returns `requiresTwoFactor` with *no* token → `/login/2fa` rejects bad code, accepts valid code and issues JWT, rejects malformed code → disable rejects wrong password → disable with correct password → login back to normal
- **Password reset:** anti-enumeration behaviour (same message for known and unknown emails), invalid token rejected (400), full end-to-end reset (old password stops working, new one works, all reset tokens consumed)
- **Account deletion:** wrong password rejected; correct password permanently erases the user

### 3. Sprint 2 Features (`sprint2.test.ts` — 22 tests)

- **Entry status tracking (US13):** default `OPEN`, mark `DONE` sets `completedAt`, reopening clears it, invalid status → 400, unknown entry → 404, `?status=` filter (Open Work view), `?dueBefore=` filter (overdue buckets)
- **Field statistics (US11):** `sum`, `avg`, and `count` aggregations with *verified arithmetic* (60 + 45 + 90 = 195, avg = 65), group-by with per-group values and descending order, all validation errors (missing field, bad operation, non-NUMBER metric, unknown fields)
- **Timeline statistics (US11/US12):** day and month bucketing with verified counts, ascending date order, invalid bucket / non-DATE field / unknown field errors

### 4. Backend Utilities (`utils.test.ts` — 22 tests)

- **calculateComputedValues (7):** empty fields, simple addition, nested parentheses, missing values default to 0, invalid formula characters throw, non-finite result throws, computed-to-computed references
- **validateFormula (5):** valid numeric references, constants and operators, non-numeric field rejected, unknown field rejected, invalid characters rejected
- **Auth utils (7):** bcrypt hashPassword round-trip, comparePassword match and mismatch, JWT generation, extraction, invalid-token rejection, tampered-token rejection
- **createFormatVersion (3):** version 1 from scratch, increment from latest, archived fields excluded from snapshot

---

## Test Files & Structure

```
apps/backend/src/__tests__/
├── api.test.ts      # 27 tests — core API (projects, fields, entries)
├── auth.test.ts     # 29 tests — register, login, 2FA, reset, deletion
├── sprint2.test.ts  # 22 tests — entry status, stats group, stats timeline
└── utils.test.ts    # 22 tests — computedFields, auth, entryFormat utils
```

Shared conventions across the files:

- **Own user per file.** Each suite creates its own test user (unique UUID + timestamped email), so suites never collide even though Vitest runs test files in parallel.
- **Setup in `beforeAll`.** Fixed data (users, projects, fields, entries) is created once; assertions run against it.
- **Cleanup via cascade.** `afterAll` deletes the test user; every foreign key is `ON DELETE CASCADE`, so projects, entries, values, and tokens disappear with it. Tests clean up after themselves.
- **Sequential within a suite.** Where one test's output feeds the next (the 2FA lifecycle), the order is deliberate and documented.
- **15s per-test timeout, 15s for data-heavy setup hooks** — the database is remote (Neon), so round-trips cost ~500ms each.
- **Utils tests use mocks** for Prisma (vi.fn()) and real implementations for crypto/JWT — fast and self-contained.

---

## How the Tests Work

A typical API test:

```ts
it("PATCH /entries/:id/status marks entry DONE and sets completedAt", async () => {
  const res = await request(app)          // real Express app, no port
    .patch(`/api/entries/${statusEntryId}/status`)
    .set(H)                                // Authorization: Bearer <real JWT>
    .send({ status: "DONE" });             // real request body

  expect(res.status).toBe(200);            // real status code
  expect(res.body.status).toBe("DONE");    // real JSON response
  expect(res.body.completedAt).not.toBeNull();
});
```

The JWT in `H` is generated by the same `generateToken` helper the login endpoint uses, so protected routes are exercised through the real `requireAuth` middleware.

For 2FA, tests produce genuine TOTP codes:

```ts
const code = generateSync({ secret });   // same library the server verifies with
const res = await request(app).post("/api/auth/login/2fa").send({
  email: TFA_EMAIL,
  token: code,
});
expect(res.body.token).toBeTruthy();      // real JWT issued
```

A typical unit test:

```ts
it("evaluates nested expressions with parentheses", () => {
  const fields = [
    { id: "a", type: "NUMBER", formula: null },
    { id: "b", type: "NUMBER", formula: null },
  ];
  const result = calculateComputedValues({ a: 2, b: 3 }, fields, "(a + b) * 4");
  expect(result.computed).toBe(20);
});
```

---

## How to Run Them

```bash
# From the repository root
npm run test --workspace=apps/backend

# Watch mode (re-runs on file changes)
npm run test:watch --workspace=apps/backend
```

Prerequisites: a reachable `DATABASE_URL` in `apps/backend/.env` and a regenerated Prisma client (`npx prisma generate` in `apps/backend` — see [Bugs Found By Testing](#bugs-found-by-testing)).

> **Email behaviour in tests:** with no SMTP credentials configured, registration auto-verifies (dev mode) and password-reset emails fail silently — both are caught and logged, and the endpoints still behave correctly. The tests assert the HTTP contract, never the email delivery.

---

## Testing Policy

1. **Every API endpoint gets tests for the happy path *and* its error paths** (400 validation, 401 auth, 404 missing, 409 conflict). If an endpoint has no error-path test, it isn't done.
2. **Never mock what we're testing** at the integration level. No Prisma mocks, no stub auth. The database is real; failures must be real failures. Unit tests for pure functions may use mocks for external dependencies.
3. **Security behaviour is tested as behaviour, not implementation** — e.g. we assert that unknown-email and wrong-password logins return byte-identical errors, not that some flag was set.
4. **Tests must clean up after themselves** via user-cascade deletion, so the shared database stays usable.
5. **Regression rule:** any bug found (see below) gets a test that would have caught it before the fix is considered done.
6. **Tests run in CI before every merge to main** — a red suite blocks the merge.

---

## Proof of Passing Runs

**Run date: 2026-09-15 · 100 / 100 tests passing · 4 / 4 test files passing**

Captured verbatim from `npm run test --workspace=apps/backend --reporter=verbose`:

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

---

## Bugs Found By Testing

Writing these tests surfaced two real issues — this is the regression rule in action:

1. **Stale Prisma client broke every entry-creation test (11 pre-existing failures).**
   The generated client predated the Sprint 2 schema, so any query touching `entry_fields.archived_at` threw `PrismaClientValidationError: Unknown argument archivedAt`. Fix: run `npx prisma generate` after pulling schema changes. *Lesson: `prisma generate` belongs in postinstall/CI.*

2. **Concurrent entry-field creation can race on format versioning.**
   Each field create does read-latest-version → insert latest+1. Two parallel creates both read version *N* and both try to insert *N+1*; the unique `(project_id, version)` constraint rejects one, so one field creation fails with 400. Tests create fields sequentially (matching real UI usage). *Fix candidate: wrap version bump in a transaction with a retry, or use `MAX(version)+1` inside a serializable transaction.*

---

## Future Work

- **Test isolation:** move to a per-run schema or transaction-rollback strategy so suites can't observe each other's data at all.
- **Rate-limiting tests** once auth rate limiting is implemented.

### Completed

- **CI gate** — the Gitea Actions workflow now runs both backend and frontend test suites on every push to main, Dineo, Alondwe, and Wendy branches.
- **Backend unit tests** — 22 utils tests cover computedFields, auth, and entryFormat.

---

*Related docs: [AUTHENTICATION.md](AUTHENTICATION.md) for what the security tests verify, and the [backend README](README.md) for endpoint reference.*
