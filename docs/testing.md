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

1,606 tests in total: 786 backend across 43 files, 820 frontend across 55
files. Line coverage is **85.0% backend** and **80.5% frontend** (October 2026;
see [Coverage](#coverage)). The per-area counts below were taken when each
area was last described and have grown since. Per-file detail for the backend lives in
[`apps/backend/TESTING.md`](https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook/src/branch/main/apps/backend/TESTING.md); the summaries
below cover the whole monorepo.

### Backend — 786 tests across 43 files

- **Core API & infrastructure (63):** `api.test.ts` (27) — health, project
  CRUD, entry fields, entries, time summaries; plus `projectDelete` (6),
  `purgeDeletedAccounts` (6), `rateLimit` (6, BUG-003), `jwtSecret`
  (5, BUG-002) and `readRetry` (13 — which failed reads may be retried, and
  that writes and real database errors never are)
- **Authentication & security (91):** `auth.test.ts` (33) — registration,
  login, route protection, the 2FA lifecycle, password reset, account
  deletion; `authCrypto.test.ts` (28) — AES-256-GCM round-trip, tamper and
  wrong-key rejection, token hashing, recovery-code generation;
  `twoFactorSecurity.test.ts` (21) — the encrypted secrets, the
  `2fa-pending` hand-off token and the recovery-code lifecycle as HTTP
  behaviour (BUG-004/005/006); `entryOwnership.test.ts` (9, BUG-011)
- **Entries, fields and versions (88):** `entryValidation` (17),
  `entryHistory` (18 — US29/30/31/32), `entriesListing` (20 — including
  paging, US33), `entryFieldIntegrity` (11 — concurrent field creation,
  BUG-001, and unique field names), `blankNumericValues` (6, BUG-012),
  `tags` (13), `recurringEntries` (3, US27)
- **Statistics & expressions (109):** `sprint2` (22 — entry status US13,
  group and timeline stats US11/US12), `stats` (10),
  `customStatistics` (27, US23), `expressions` (28),
  `expressionStats` (22)
- **Automation, dashboard, integrations and utilities (192):**
  `automationEngine.test.ts` (51 — rule CRUD, triggers, conditions,
  actions, history, no-looping, ownership; US24),
  `automationRules.test.ts` (28 — the pure evaluator), `dashboardLayout`
  (8 — the saved panel layout, US26), `googleCalendar` (13) and
  `googleCalendarSync` (7) — the OAuth hand-off and the idempotent due-date
  mirror (FEAT-001), `reminders` (42, US28), `push` (11 — push
  subscriptions and the due-reminder delivery job, US28), `utils` (32 —
  computed fields, formulas, auth utils, format versions)

### Frontend — 820 tests across 55 files

#### API client, offline queue and import/export (72 tests)

- **`client.test.ts` (10)** — the axios interceptors: 401 clears the
  session and redirects to `/login?expired=1` on protected routes but not
  on credential routes or non-401 errors; the stored token is attached to
  outgoing requests
- **`api.test.ts` (26)** — project and field requests, `fetchEntries`
  with the offline queue, `createEntry`, `fetchAllEntries`, and the
  export/import round-trip
- **`offlineCache.test.ts` (7), `offlineEntries.test.ts` (18),
  `offlineProjects.test.ts` (11)** — the offline layer: cache reads and
  expiry, queueing entries and projects, and syncing them back

#### Notifications (10 tests)

- **`reminderNotifications.test.ts` (10)** — in-app reminder notifications
  (off until turned on, reminders already due at switch-on are not
  announced, each reminder announced once, a summary when many fall due,
  permission refused stays off) and the push path (device subscribes when
  the server has push set up, the server takes over announcing while
  pushing, in-app fallback when the server has push off, unsubscribe when
  turned off)

#### Component behaviour (116 tests)

- **`EntryForm.test.tsx` (9)** — dynamic fields, validation errors,
  submit behaviour
- **`displayComponents.test.tsx` (18)** — StatusBadge, TagList, EntryCard,
  ProjectCard
- **`interactiveComponents.test.tsx` (26)** — Modal, Stopwatch, TagInput,
  ChecklistInput
- **`ProtectedRoute.test.tsx` (3)** — redirect without a token, render
  with one
- **`AutomationRules.test.tsx` (25)** — the US24 rule builder: listing,
  creating, editing, and the operator vocabulary the UI offers
- **`EntryHistoryModal.test.tsx` (19)** — the version list, comparing an
  older version field by field, and restoring with confirmation
  (US29–US31)
- **`DeleteProjectModal.test.tsx` (16)** — the typed-name guard, what the
  dialog says, and failures

#### Pages (159 tests)

- **`DashboardPage.test.tsx` (19)** — greeting, chosen panels, charts,
  empty states
- **`LoginPage.test.tsx` (5)** / **`RegisterPage.test.tsx` (7)** — the
  session-expired banner, form presence, client-side validation
- **`ProjectsPage.test.tsx` (21)** — loading, listing, creating, editing,
  archiving
- **`EntriesPage.test.tsx` (19)** — the timeline, paging with "Load more",
  saved filters, loading states
- **`OpenWorkPage.test.tsx` (17)** — gathering open work in one request,
  sorting it into overdue buckets, the calendar link, marking work done
- **`CalendarPage.test.tsx` (14)** — month navigation, entries on a day,
  project switching
- **`StatsPage.test.tsx` (44)** — time per project, group and total
  statistics, over-time charts, custom expressions, saved statistics
- **`RemindersPage.test.tsx` (13)** — viewing, completing and dismissing
  reminders, creating one, the rules behind them (US28 AT1–AT4)

#### Pure logic (60 tests)

- **`savedFilters.test.ts` (14)** — saved-filter persistence in
  localStorage
- **`formulas.test.ts` (16)** — the computed-field formula helpers
- **`utils.test.ts` (11)** — date keys, formatting, streaks
- **`dashboardInsights.test.ts` (13)** — streaks, monthly counts, weekly
  progress and tag ranking for the dashboard panels
- **`dashboardPreferences.test.ts` (6)** — dashboard panel preferences

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

Backend prerequisites: a reachable test database and a regenerated Prisma
client (`npx prisma generate` in `apps/backend` — see
[Bugs Found By Testing](#bugs-found-by-testing)).

> **Never point the backend suite at production data.** The suite creates and
> deletes its own users, projects and entries. Give it a database of its own:
>
> ```bash
> # once: an empty database next to your development one, with the schema
> createdb logbook_test            # or CREATE DATABASE logbook_test;
> DATABASE_URL=postgresql://…/logbook_test npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
>
> # each run: DATABASE_URL set for the command wins over apps/backend/.env
> DATABASE_URL=postgresql://…/logbook_test npm run test --workspace=apps/backend
> ```
>
> CI does the same with a throwaway PostgreSQL service container created for
> each run (or a `TEST_DATABASE_URL` secret, for a runner that cannot start
> service containers), so a pipeline never writes into the deployed database.

> **Email behaviour in tests:** with no SMTP credentials configured,
> registration auto-verifies (dev mode) and password-reset emails fail
> silently — both are caught and logged, and the endpoints still behave
> correctly. The tests assert the HTTP contract, never the email delivery.

---

## Coverage

| Workspace | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| Backend | 85.0% | 84.1% | 79.6% | 92.4% |
| Frontend | 80.5% | 78.9% | 76.9% | 76.4% |

*Measured 7 October 2026 with `npm run test:coverage` in each workspace. The
largest remaining gaps are deliberate: the animated sign-in background (canvas
drawing jsdom cannot render) and the parts of the project page exercised by the
backend suite instead.*

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

### The CI database link, and the ETIMEDOUT failures

The backend suites run against the hosted Neon database over the public
internet. CI has failed repeatedly with `ETIMEDOUT` — a transport error,
raised before the statement ever reached Postgres — landing on an arbitrary
query while everything around it read and wrote to the same database without
trouble.

This section has now been wrong twice, so it records what was ruled out as
carefully as what was tried.

**Ruled out by measurement.** Capping the worker count cut peak concurrency
threefold and the failure did not move, which rules out connection-pool
pressure. Other suites complete writes seconds *before* a failure in the same
run, which rules out a cold start of the serverless compute.

**Tried and did not work.** The pool was created with a connection string and
nothing else, so every `pg.Pool` default applied, including `keepAlive: false`.
Enabling keepalive looked like the answer — `DATABASE_URL` points at Neon's
`-pooler` endpoint, which drops connections that go quiet. It did not fix it:
the next run went from three failures to eight. `keepAlive` is kept because it
is right for a long-lived pool against a pooler, but it is not the cause. A
speculative `max: 5` added at the same time was removed again; it had no
evidence behind it and the run got slower.

**What the evidence actually showed.** In the run of 2026-09-27 every one of
the eight failures was a *read* that timed out: four in `loadHistory`'s
`findFirst`, three in the `findUniqueOrThrow` that takes the pre-edit snapshot
in `updateEntry`, one in `getEntries`' `findMany`. Several surfaced not as an
error but as a wrong answer downstream — an entry stuck at version 1, a time
summary reading 30 instead of 90 — because the read failed inside a handler
that carried on regardless.

**The fix that follows from that.** `utils/readRetry.ts` retries an operation
only when both hold: it is one of the eight idempotent reads, and it failed
with a transport code (`ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, or
Prisma's `P1001`, `P1002`, `P1017`). Up to three attempts, with a growing
pause. It is applied to every query through a Prisma client extension in
`prisma.ts`.

Three things it deliberately never does: retry a write, because one that timed
out at the transport may still have landed; retry raw SQL, because
`$queryRawUnsafe` could be anything; and retry an error the database actually
returned, so a constraint violation is still raised on the first attempt and
cannot be hidden. `readRetry.test.ts` holds each of those as its own test.

This is also right beyond CI. A student should not see a 500 because one TCP
connection went quiet between two of their queries, and a question asked twice
returns the same answer.

The retry in `entriesListing.test.ts` predates this and is kept; its setup
writes are idempotent by construction, since the user fixture upserts and the
entry seed is guarded by a row count.

If `ETIMEDOUT` still reaches an assertion after this, the next thing to
examine is load rather than connections: the suite runs for eight minutes
against a free-tier instance, and `automationEngine` alone accounts for six of
those.

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

**Run date: 2026-09-28 · 960 / 960 tests passing · 57 / 57 test files passing**

### Backend (543 tests, 30 files)

Captured from `npx vitest run --coverage` in `apps/backend` (run against
the remote database with Vitest's default worker pool — per-file times are
wall-clock and include queue time on their worker):

```text
 ✓ src/__tests__/api.test.ts (27 tests) 52202ms
 ✓ src/__tests__/auth.test.ts (33 tests) 19647ms
 ✓ src/__tests__/authCrypto.test.ts (28 tests) 41ms
 ✓ src/__tests__/automationEngine.test.ts (51 tests) 364029ms
 ✓ src/__tests__/automationRules.test.ts (28 tests) 32ms
 ✓ src/__tests__/blankNumericValues.test.ts (6 tests) 48645ms
 ✓ src/__tests__/customStatistics.test.ts (27 tests) 48404ms
 ✓ src/__tests__/dashboardLayout.test.ts (8 tests) 3458ms
 ✓ src/__tests__/entriesListing.test.ts (20 tests) 23826ms
 ✓ src/__tests__/entryFieldIntegrity.test.ts (11 tests) 64783ms
 ✓ src/__tests__/entryHistory.test.ts (18 tests) 181306ms
 ✓ src/__tests__/entryOwnership.test.ts (9 tests) 18324ms
 ✓ src/__tests__/entryValidation.test.ts (17 tests) 198700ms
 ✓ src/__tests__/expressionStats.test.ts (22 tests) 14636ms
 ✓ src/__tests__/expressions.test.ts (28 tests) 15ms
 ✓ src/__tests__/googleCalendar.test.ts (13 tests) 144ms
 ✓ src/__tests__/googleCalendarSync.test.ts (7 tests) 18ms
 ✓ src/__tests__/jwtSecret.test.ts (5 tests) 113ms
 ✓ src/__tests__/projectDelete.test.ts (6 tests) 36956ms
 ✓ src/__tests__/purgeDeletedAccounts.test.ts (6 tests) 3847ms
 ✓ src/__tests__/push.test.ts (11 tests) 47473ms
 ✓ src/__tests__/rateLimit.test.ts (6 tests) 142ms
 ✓ src/__tests__/readRetry.test.ts (13 tests) 20ms
 ✓ src/__tests__/recurringEntries.test.ts (3 tests) 6ms
 ✓ src/__tests__/reminders.test.ts (42 tests) 246032ms
 ✓ src/__tests__/sprint2.test.ts (22 tests) 40367ms
 ✓ src/__tests__/stats.test.ts (10 tests) 148602ms
 ✓ src/__tests__/tags.test.ts (13 tests) 69569ms
 ✓ src/__tests__/twoFactorSecurity.test.ts (21 tests) 19031ms
 ✓ src/__tests__/utils.test.ts (32 tests) 775ms

 Test Files  30 passed (30)
      Tests  543 passed (543)
   Duration  472.23s (transform 8.32s, setup 678ms, import 61.59s, tests 1805.11s, environment 5ms)
```

### Frontend (417 tests, 27 files)

```text
 ✓ src/__tests__/api.test.ts (26 tests) 911ms
 ✓ src/api/__tests__/client.test.ts (10 tests) 158ms
 ✓ src/components/__tests__/AutomationRules.test.tsx (25 tests) 7742ms
 ✓ src/components/__tests__/DeleteProjectModal.test.tsx (16 tests) 12847ms
 ✓ src/components/__tests__/EntryForm.test.tsx (9 tests) 7166ms
 ✓ src/components/__tests__/EntryHistoryModal.test.tsx (19 tests) 8641ms
 ✓ src/components/__tests__/ProtectedRoute.test.tsx (3 tests) 98ms
 ✓ src/components/__tests__/displayComponents.test.tsx (18 tests) 2248ms
 ✓ src/components/__tests__/interactiveComponents.test.tsx (26 tests) 8203ms
 ✓ src/lib/__tests__/dashboardInsights.test.ts (13 tests) 50ms
 ✓ src/lib/__tests__/dashboardPreferences.test.ts (6 tests) 19ms
 ✓ src/lib/__tests__/formulas.test.ts (16 tests) 109ms
 ✓ src/lib/__tests__/offlineCache.test.ts (7 tests) 117ms
 ✓ src/lib/__tests__/offlineEntries.test.ts (18 tests) 53ms
 ✓ src/lib/__tests__/offlineProjects.test.ts (11 tests) 590ms
 ✓ src/lib/__tests__/reminderNotifications.test.ts (10 tests) 167ms
 ✓ src/lib/__tests__/savedFilters.test.ts (14 tests) 21ms
 ✓ src/lib/__tests__/utils.test.ts (11 tests) 59ms
 ✓ src/pages/__tests__/CalendarPage.test.tsx (14 tests) 18950ms
 ✓ src/pages/__tests__/DashboardPage.test.tsx (19 tests) 19185ms
 ✓ src/pages/__tests__/EntriesPage.test.tsx (19 tests) 7473ms
 ✓ src/pages/__tests__/LoginPage.test.tsx (5 tests) 5820ms
 ✓ src/pages/__tests__/OpenWorkPage.test.tsx (17 tests) 6467ms
 ✓ src/pages/__tests__/ProjectsPage.test.tsx (21 tests) 8542ms
 ✓ src/pages/__tests__/RegisterPage.test.tsx (7 tests) 7545ms
 ✓ src/pages/__tests__/RemindersPage.test.tsx (13 tests) 16898ms
 ✓ src/pages/__tests__/StatsPage.test.tsx (44 tests) 54601ms

 Test Files  27 passed (27)
      Tests  417 passed (417)
   Duration  74.92s (transform 9.60s, setup 53.52s, import 29.18s, tests 195.29s, environment 166.84s)
```

### Coverage (V8 provider, from the same runs)

| Suite | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Backend | 84.38% | 79.73% | 90.88% | 85.12% |
| Frontend | 58.94% | 55.07% | 59.27% | 59.54% |
| **Combined (lines)** | | | | **68.89%** (4,085 of 5,930) |

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
   creation fails with 400. **Fixed (BUG-001):** the version bump now
   runs in a transaction and retries on a unique-constraint collision, so
   the loser of the race reads again and takes the next number.
   `entryFieldIntegrity.test.ts` creates and deletes fields concurrently
   and checks every version number is distinct and gapless.

---

## Future Work

- **Test isolation:** move to a per-run schema or transaction-rollback strategy so backend suites can't observe each other's data at all.

### Completed

- **CI gate** — the Gitea Actions workflow runs both backend and frontend test suites on every push to `main`, `master`, `Alondwe` and `Dineo`. It needs a Gitea Actions runner to be online; while none is, runs wait in the queue and start once one returns.
- **Backend unit tests** — utils tests cover computedFields, auth, and entryFormat.
- **Frontend component and UI tests** — page-level tests cover the dashboard, login/register, projects, entries timeline, open work, calendar, statistics and reminders pages, alongside the component and offline-layer suites.
- **Rate-limiting tests** — `rateLimit.test.ts` locks in the BUG-003 fix.

---

*Related: [Third-Party Code](third-party.md) documents the testing
libraries and their licences, and [Database Design](design/database-erd.md)
describes the schema the integration tests run against.*
