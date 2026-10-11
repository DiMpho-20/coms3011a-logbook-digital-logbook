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
| **Real PostgreSQL** | Real database | Integration tests run against a real PostgreSQL database with the app's schema — a database created for each run in CI, and locally whatever `DATABASE_URL` points at (point it at a dedicated database, as docs/testing.md recommends, if you don't want test users in your dev data) — exercising real Prisma queries, real constraints (unique, cascade deletes), and real SQL aggregation. Mocking Prisma would test our mocks, not our app. |
| **otplib** | TOTP code generation in tests | The 2FA tests generate *genuinely valid* time-based codes with the same library the server uses to verify them, so the full TOTP round-trip is tested end-to-end. |

**Testing pyramid position:** the API tests are **integration tests** — they sit above unit tests and below end-to-end UI tests. Each test makes a real HTTP request to the real app backed by the real database, and asserts on the HTTP response. The utils tests are **unit tests** that exercise pure functions in isolation.

---

## What We Test

789 tests across 43 files (85% line coverage, October 2026). The original four Sprint 2 files are still here; the suite has grown around them feature by feature, and most newer files are named after the bug or user story they lock in.

### Core API & infrastructure

- **`api.test.ts` (27)** — health and database connectivity; project CRUD with 404/409/400 error paths; entry-field creation per type; entry CRUD with and without dates; time-summary aggregation
- **`projectDelete.test.ts` (6)** — the delete-project endpoint: cascade behaviour, ownership, archived projects
- **`purgeDeletedAccounts.test.ts` (6)** — the 30-day grace-period purge job: expired accounts erased, scheduled ones untouched, idempotent re-runs
- **`rateLimit.test.ts` (6)** — BUG-003: the limiter throttles once its window is spent, and the feature switch turns it off
- **`jwtSecret.test.ts` (5)** — BUG-002: the JWT secret is random per-process in development and the server refuses to start in production without one

### Authentication & security

- **`auth.test.ts` (33)** — registration, login (identical errors for unknown email and wrong password), route protection, the full 2FA lifecycle, password reset with anti-enumeration, account deletion
- **`authCrypto.test.ts` (28)** — BUG-004/005 cryptography in isolation: AES-256-GCM round-trip, fresh IV per encryption, tamper and wrong-key rejection, envelope-vs-plaintext detection, refusal to encrypt without a key, token hashing, recovery-code generation
- **`twoFactorSecurity.test.ts` (21)** — BUG-004/005/006 as behaviour over HTTP: secrets stored as envelopes, the `2fa-pending` hand-off token (five refusal cases, including the old email-based contract and a session token submitted in its place), recovery-code issue/spend/replay/regenerate/discard
- **`entryOwnership.test.ts` (9)** — BUG-011: another user's entries and statistics are unreachable, and the owner is unaffected

### Entries, fields and versions

- **`entryValidation.test.ts` (17)** — server-side value validation per field type, and format migration backfilling existing entries
- **`entryHistory.test.ts` (18)** — US20 editing preserves the previous version, US21 viewing an entry as it was on a date, US22 restoring a version, US30 archiving, and cross-user history unreachability
- **`entriesListing.test.ts` (14)** — the flat entries listing: ownership, filters, ordering, limit and response shape
- **`blankNumericValues.test.ts` (6)** — BUG-012: a blank numeric field is not stored, and aggregations survive a non-numeric row
- **`tags.test.ts` (13)** — project tags, entry tags, and the tag endpoints
- **`recurringEntries.test.ts` (3)** — recurring-entry patterns (US27)

### Statistics & expressions

- **`sprint2.test.ts` (22)** — entry status tracking (US13), group statistics (US11), timeline statistics (US11/US12)
- **`stats.test.ts` (10)** — aggregating COMPUTED fields, counting non-numeric fields, statistics updating after entries change
- **`customStatistics.test.ts` (27)** — US17: saving, reading, changing and removing custom statistics, and values that follow the data
- **`expressions.test.ts` (28)** — the expression language: aggregate functions, arithmetic, refusals, `aggregatesUsed`
- **`expressionStats.test.ts` (22)** — the expression statistics endpoint: results and rejections

### Automation, integrations, utilities

- **`automationEngine.test.ts` (51)** — US26 end-to-end: rule CRUD and validation, triggers, conditions against real entries, actions, history, the no-looping guarantee, broken rules never costing the user their entry, ownership
- **`automationRules.test.ts` (28)** — US26's pure evaluator: conditions on entry attributes and custom fields, failing closed, combining conditions, operators offered per field type, `describeRuleProblem`
- **`googleCalendar.test.ts` (13)** — FEAT-001: OAuth state, token encryption, connect and callback (including forged-state rejection)
- **`googleCalendarSync.test.ts` (7)** — FEAT-001: the idempotent due-date mirror — create, update, remove, convergence on re-run
- **`reminders.test.ts` (42)** — US28: reminder helpers, reminders generated from entries, manual reminders, viewing, completing and dismissing, settings
- **`push.test.ts` (11)** — US28 web push: the public key, subscription validation and re-subscription, and the delivery job — a reminder is pushed when it falls due, pushed again after a snooze, never twice, with one summary when many fall due at once and devices the push service reports gone are dropped
- **`utils.test.ts` (32)** — calculateComputedValues, validateFormula, affectedComputedFields, computed chains, auth utils, createFormatVersion

---

## Test Files & Structure

```
apps/backend/src/__tests__/
├── api.test.ts                 #  27 — core API (projects, fields, entries)
├── auth.test.ts                #  33 — register, login, 2FA lifecycle, reset, deletion
├── authCrypto.test.ts          #  28 — TOTP encryption, token hashing, recovery codes (unit)
├── automationEngine.test.ts    #  51 — automation rules end-to-end (US26)
├── automationRules.test.ts     #  28 — the pure rule evaluator (US26)
├── blankNumericValues.test.ts  #   6 — BUG-012 regression
├── customStatistics.test.ts    #  27 — saved statistics (US17)
├── entriesListing.test.ts      #  14 — flat listing, filters, ordering
├── entryHistory.test.ts        #  18 — versions, as-of views, restore, archive
├── entryOwnership.test.ts      #   9 — BUG-011 regression
├── entryValidation.test.ts     #  17 — value validation, backfill
├── expressions.test.ts         #  28 — expression language (unit)
├── expressionStats.test.ts     #  22 — expression statistics endpoint
├── googleCalendar.test.ts      #  13 — OAuth connect and callback (FEAT-001)
├── googleCalendarSync.test.ts  #   7 — the due-date mirror (FEAT-001)
├── jwtSecret.test.ts           #   5 — BUG-002 regression
├── projectDelete.test.ts       #   6 — project deletion
├── purgeDeletedAccounts.test.ts#   6 — deletion grace-period purge
├── push.test.ts                #  11 — push subscriptions and delivery (US28)
├── rateLimit.test.ts           #   6 — BUG-003 regression
├── recurringEntries.test.ts    #   3 — recurring entries (US27)
├── reminders.test.ts           #  42 — reminders (US28)
├── sprint2.test.ts             #  22 — entry status, stats group, stats timeline
├── stats.test.ts               #  10 — computed-field aggregation
├── tags.test.ts                #  13 — project and entry tags
├── twoFactorSecurity.test.ts   #  21 — 2FA hardening as behaviour
└── utils.test.ts               #  32 — computedFields, auth, entryFormat utils
```

Shared conventions across the files:

- **Own user per file.** Each suite creates its own test user (unique UUID + timestamped email), so suites never collide even though Vitest runs test files in parallel.
- **Setup in `beforeAll`.** Fixed data (users, projects, fields, entries) is created once; assertions run against it.
- **Cleanup via cascade.** `afterAll` deletes the test user; every foreign key is `ON DELETE CASCADE`, so projects, entries, values, and tokens disappear with it. Tests clean up after themselves.
- **Sequential within a suite.** Where one test's output feeds the next (the 2FA lifecycle), the order is deliberate and documented.
- **60s per-test and setup-hook timeout** — raised from 15s after a loaded CI runner measured a single test at 14.7s and a setup hook at 17s: a slow queue must not fail a run, while a genuine hang still does.
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

For 2FA, tests produce genuine TOTP codes — and exercise the real two-step contract, including the hand-off token that links the steps (BUG-006):

```ts
// Step 1: the password verifies, but no session is issued yet.
const pending = await request(app).post("/api/auth/login").send({
  email: TFA_EMAIL,
  password: TEST_PASSWORD,
});
expect(pending.body.requiresTwoFactor).toBe(true);

// Step 2: a genuinely valid code, plus the pending token from step 1.
const code = generateSync({ secret });   // same library the server verifies with
const res = await request(app).post("/api/auth/login/2fa").send({
  twoFactorToken: pending.body.twoFactorToken,
  code,
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

**Run date: 2026-10-11 · 789 / 789 tests passing · 43 / 43 test files passing**

Captured from `npm run test:coverage --workspace=apps/backend` (run against
a local PostgreSQL database with Vitest's default worker pool — per-file times are
wall-clock and include the time a file spent queued behind its worker's
previous file):

```text
 ✓ src/__tests__/api.test.ts (27 tests) 3768ms
 ✓ src/__tests__/assessmentReminderRules.test.ts (12 tests) 70ms
 ✓ src/__tests__/assessmentReminders.test.ts (22 tests) 19824ms
 ✓ src/__tests__/assistant.test.ts (14 tests) 685ms
 ✓ src/__tests__/auth.test.ts (33 tests) 17480ms
 ✓ src/__tests__/authCrypto.test.ts (28 tests) 114ms
 ✓ src/__tests__/automationEngine.test.ts (51 tests) 15416ms
 ✓ src/__tests__/automationRules.test.ts (28 tests) 137ms
 ✓ src/__tests__/blankNumericValues.test.ts (6 tests) 4814ms
 ✓ src/__tests__/customStatistics.test.ts (27 tests) 5211ms
 ✓ src/__tests__/dashboardLayout.test.ts (8 tests) 4086ms
 ✓ src/__tests__/entriesListing.test.ts (20 tests) 6587ms
 ✓ src/__tests__/entryFieldIntegrity.test.ts (11 tests) 5227ms
 ✓ src/__tests__/entryHistory.test.ts (18 tests) 11127ms
 ✓ src/__tests__/entryOwnership.test.ts (9 tests) 3866ms
 ✓ src/__tests__/entryValidation.test.ts (17 tests) 11320ms
 ✓ src/__tests__/expressions.test.ts (28 tests) 107ms
 ✓ src/__tests__/expressionStats.test.ts (22 tests) 5960ms
 ✓ src/__tests__/googleCalendar.test.ts (13 tests) 214ms
 ✓ src/__tests__/googleCalendarSync.test.ts (7 tests) 47ms
 ✓ src/__tests__/grades.test.ts (42 tests) 11347ms
 ✓ src/__tests__/gradesValidation.test.ts (53 tests) 642ms
 ✓ src/__tests__/importLogbook.test.ts (8 tests) 5342ms
 ✓ src/__tests__/jwtSecret.test.ts (5 tests) 269ms
 ✓ src/__tests__/openEntries.test.ts (5 tests) 2341ms
 ✓ src/__tests__/profile.test.ts (23 tests) 5001ms
 ✓ src/__tests__/profileInput.test.ts (38 tests) 96ms
 ✓ src/__tests__/projectDelete.test.ts (6 tests) 4201ms
 ✓ src/__tests__/projectSchema.test.ts (2 tests) 109ms
 ✓ src/__tests__/purgeDeletedAccounts.test.ts (6 tests) 2383ms
 ✓ src/__tests__/push.test.ts (11 tests) 4514ms
 ✓ src/__tests__/rateLimit.test.ts (6 tests) 422ms
 ✓ src/__tests__/readRetry.test.ts (15 tests) 122ms
 ✓ src/__tests__/recurringEntries.test.ts (3 tests) 31ms
 ✓ src/__tests__/referenceIntegrity.test.ts (12 tests) 3642ms
 ✓ src/__tests__/reminders.test.ts (42 tests) 16354ms
 ✓ src/__tests__/savedFilters.test.ts (6 tests) 3367ms
 ✓ src/__tests__/sprint2.test.ts (22 tests) 4726ms
 ✓ src/__tests__/stats.test.ts (13 tests) 8278ms
 ✓ src/__tests__/tags.test.ts (13 tests) 4673ms
 ✓ src/__tests__/timeSummaries.test.ts (3 tests) 6053ms
 ✓ src/__tests__/twoFactorSecurity.test.ts (21 tests) 13853ms
 ✓ src/__tests__/utils.test.ts (33 tests) 4689ms

 Test Files  43 passed (43)
      Tests  789 passed (789)
   Duration  102.29s (transform 13.12s, setup 1.73s, import 126.50s, tests 218.52s, environment 25ms)
```

**Coverage (V8 provider):** 84.23% statements · 79.79% branches · 92.7%
functions · 85.16% lines.

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

### Completed

- **CI gate** — the Gitea Actions workflow now runs both backend and frontend test suites on every push to main, Dineo, Alondwe, and Wendy branches.
- **Backend unit tests** — 22 utils tests cover computedFields, auth, and entryFormat.
- **Rate-limiting tests** — `rateLimit.test.ts` locks in the BUG-003 fix.

---

*Related docs: [AUTHENTICATION.md](AUTHENTICATION.md) for what the security tests verify, and the [backend README](README.md) for endpoint reference.*
