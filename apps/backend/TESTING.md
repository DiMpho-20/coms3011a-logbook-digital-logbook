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

**Testing pyramid position:** these are **integration tests** (sometimes called API tests). They sit above unit tests and below end-to-end UI tests: each test makes a real HTTP request to the real app backed by the real database, and asserts on the HTTP response.

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
- **2FA full lifecycle, in order:** status check → setup (secret + QR data URL) → wrong code rejected → valid code enables → login now returns `requiresTwoFactor` with *no* token → `/login/2fa` rejects bad code, accepts valid code and issues JWT → disable rejects wrong password → disable with correct password → login back to normal
- **Password reset:** anti-enumeration behaviour, invalid token rejected (400), full end-to-end reset (old password stops working, new one works, all reset tokens consumed)
- **Account deletion:** wrong password rejected; correct password permanently erases the user

### 3. Sprint 2 Features (`sprint2.test.ts` — 22 tests)

- **Entry status tracking (US13):** default `OPEN`, mark `DONE` sets `completedAt`, reopening clears it, invalid status → 400, unknown entry → 404, `?status=` filter (Open Work view), `?dueBefore=` filter (overdue buckets)
- **Field statistics (US11):** `sum`, `avg`, and `count` aggregations with *verified arithmetic* (60 + 45 + 90 = 195, avg = 65), group-by with per-group values and descending order, all validation errors (missing field, bad operation, non-NUMBER metric, unknown fields)
- **Timeline statistics (US11/US12):** day and month bucketing with verified counts, ascending date order, invalid bucket / non-DATE field / unknown field errors

---

## Test Files & Structure

```
apps/backend/src/__tests__/
├── api.test.ts      # 27 tests — core API (projects, fields, entries)
├── auth.test.ts     # 29 tests — register, login, 2FA, reset, deletion
└── sprint2.test.ts  # 22 tests — entry status, stats group, stats timeline
```

Shared conventions across the files:

- **Own user per file.** Each suite creates its own test user (unique UUID + timestamped email), so suites never collide even though Vitest runs test files in parallel.
- **Setup in `beforeAll`.** Fixed data (users, projects, fields, entries) is created once; assertions run against it.
- **Cleanup via cascade.** `afterAll` deletes the test user; every foreign key is `ON DELETE CASCADE`, so projects, entries, values, and tokens disappear with it. Tests clean up after themselves.
- **Sequential within a suite.** Where one test's output feeds the next (the 2FA lifecycle), the order is deliberate and documented.
- **15s per-test timeout, 60s for data-heavy setup hooks** — the database is remote (Neon), so round-trips cost ~500ms each.

---

## How the Tests Work

A typical test:

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

---

## How to Run Them

```bash
# From the repository root
npm run test --workspace=backend

# Watch mode (re-runs on file changes)
npm run test:watch --workspace=backend
```

Prerequisites: a reachable `DATABASE_URL` in `apps/backend/.env` and a regenerated Prisma client (`npx prisma generate` in `apps/backend` — see [Bugs Found By Testing](#bugs-found-by-testing)).

> **Email behaviour in tests:** with no SMTP credentials configured, registration auto-verifies (dev mode) and password-reset emails fail silently — both are caught and logged, and the endpoints still behave correctly. The tests assert the HTTP contract, never the email delivery.

---

## Testing Policy

1. **Every API endpoint gets tests for the happy path *and* its error paths** (400 validation, 401 auth, 404 missing, 409 conflict). If an endpoint has no error-path test, it isn't done.
2. **Never mock what we're testing.** No Prisma mocks, no stub auth. The database is real; failures must be real failures.
3. **Security behaviour is tested as behaviour, not implementation** — e.g. we assert that unknown-email and wrong-password logins return byte-identical errors, not that some flag was set.
4. **Tests must clean up after themselves** via user-cascade deletion, so the shared database stays usable.
5. **Regression rule:** any bug found (see below) gets a test that would have caught it before the fix is considered done.
6. **Tests run before every merge to main** — a red suite blocks the merge.

---

## Proof of Passing Runs

**Run date: 2026-09-14 · 78 / 78 tests passing · 3 / 3 test files passing**

Captured verbatim from `npm run test --workspace=backend`:

```text
 ✓ src/__tests__/api.test.ts (27 tests) 29991ms
     ✓ POST /api/projects creates a project 533ms
     ✓ POST /api/projects rejects duplicate name → 409 1796ms
     ✓ GET /api/projects/:id returns 404 for unknown id 512ms
     ✓ PUT /api/projects/:id rejects rename to duplicate → 409 1796ms
     ✓ PATCH /api/projects/:id/status toggles to ARCHIVED 519ms
     ✓ POST /api/projects/:id/entry-fields creates a field 1535ms
     ✓ POST /api/projects/:id/entries creates an entry with values 2829ms
     ✓ PUT /api/entries/:id updates duration and values 2817ms
     ✓ GET /api/projects/:id/time-summary reflects entries 516ms
     ✓ DELETE /api/entries/:id deletes the entry 517ms
     ✓ deletes test project and cascades all related data 1304ms
     ... (27/27 ✓)

 ✓ src/__tests__/auth.test.ts (29 tests) 15893ms
     ✓ POST /auth/register creates a user → 201 879ms
     ✓ POST /auth/register rejects duplicate email → 409
     ✓ POST /auth/register rejects a weak password → 400
     ✓ POST /auth/login returns a JWT for valid credentials 335ms
     ✓ POST /auth/login rejects a wrong password → 401 339ms
     ✓ POST /auth/login rejects an unknown email → 401 (same message)
     ✓ POST /auth/login blocks unverified accounts → 403 638ms
     ✓ POST /2fa/setup returns a secret and QR code 539ms
     ✓ POST /2fa/verify-setup rejects an incorrect code → 400
     ✓ POST /2fa/verify-setup accepts a valid code and enables 2FA 516ms
     ✓ login with 2FA enabled returns requiresTwoFactor and no token 348ms
     ✓ POST /login/2fa rejects an invalid code → 401
     ✓ POST /login/2fa accepts a valid code and issues a JWT
     ✓ POST /2fa/disable rejects a wrong password → 401 329ms
     ✓ POST /2fa/disable with correct password disables 2FA 581ms
     ✓ login works normally again after 2FA is disabled 331ms
     ✓ POST /forgot-password returns the same message for real emails 1232ms
     ✓ resets the password end-to-end with a valid token 3238ms
     ✓ DELETE /auth/account rejects a wrong password → 401 324ms
     ✓ DELETE /auth/account with correct password erases the account 839ms
     ... (29/29 ✓)

 ✓ src/__tests__/sprint2.test.ts (22 tests) 33061ms
     ✓ creates an entry with default OPEN status 2555ms
     ✓ PATCH /entries/:id/status marks entry DONE and sets completedAt 1788ms
     ✓ PATCH /entries/:id/status back to OPEN clears completedAt 1774ms
     ✓ PATCH /entries/:id/status returns 404 for unknown id 767ms
     ✓ GET entries supports ?status= filter (open work view) 3302ms
     ✓ GET entries supports ?dueBefore= filter (overdue buckets) 3579ms
     ✓ sums a NUMBER field across entries 513ms
     ✓ averages a NUMBER field 515ms
     ✓ counts entries with a TEXT metric field 525ms
     ✓ groups a NUMBER metric by a TEXT field 761ms
     ✓ returns 404 for an unknown group-by field 508ms
     ✓ buckets entry counts by day using a DATE field 509ms
     ✓ supports month bucketing 509ms
     ... (22/22 ✓)

 Test Files  3 passed (3)
      Tests  78 passed (78)
   Duration  34.17s
```

Full per-test timings are reproducible by running the suite; the summary above is the actual output of the run (abridged only to fit the page — every listed test shows `✓`).

---

## Bugs Found By Testing

Writing these tests surfaced two real issues — this is the regression rule in action:

1. **Stale Prisma client broke every entry-creation test (11 pre-existing failures).**
   The generated client predated the Sprint 2 schema, so any query touching `entry_fields.archived_at` threw `PrismaClientValidationError: Unknown argument archivedAt`. Fix: run `npx prisma generate` after pulling schema changes. *Lesson: `prisma generate` belongs in postinstall/CI.*

2. **Concurrent entry-field creation can race on format versioning.**
   Each field create does read-latest-version → insert latest+1. Two parallel creates both read version *N* and both try to insert *N+1*; the unique `(project_id, version)` constraint rejects one, so one field creation fails with 400. Tests create fields sequentially (matching real UI usage). *Fix candidate: wrap version bump in a transaction with a retry, or use `MAX(version)+1` inside a serializable transaction.*

---

## Future Work

- **CI gate:** run the suite automatically in the Gitea workflow on every push to a PR branch (currently the workflow only builds).
- **UI tests:** add Vitest Browser Mode / Playwright component tests for the frontend (saved filters, entry form stopwatch, offline queue).
- **Test isolation:** move to a per-run schema or transaction-rollback strategy so suites can't observe each other's data at all.
- **Rate-limiting tests** once auth rate limiting is implemented.

---

*Related docs: [AUTHENTICATION.md](AUTHENTICATION.md) for what the security tests verify, and the [backend README](README.md) for endpoint reference.*
