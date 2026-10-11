# Testing

This page documents how the Digital Logbook is tested: our test stack and
why we chose it, what is covered by automated tests, what we deliberately
leave untested, the formal user feedback process, our testing policy, and
proof of passing runs.

---

## Test Stack & Why We Chose It

| Tool | Role | Why |
|---|---|---|
| **Vitest 4** | Test runner and assertion framework | Same engine that powers our frontend build tooling (Vite), so one dependency ecosystem covers the whole monorepo. Fast, ESM-native, and watch-mode works out of the box with TypeScript — no extra transpile config. |
| **Supertest** | HTTP-level request helper (backend) | Lets tests call the Express app directly (`request(app).post(...)`) without starting a real server or opening a port. We test the real HTTP layer — routing, middleware, validation, status codes, JSON bodies — not just functions. |
| **React Testing Library** | Component testing (frontend) | Tests components the way users interact with them — finding elements by placeholder text, role, and label rather than by implementation details like CSS class or component state. |
| **jsdom** | Browser environment for frontend tests | Provides a lightweight DOM inside Node.js so React components can render, fire events, and validate forms without a real browser. |
| **The real Express app** (`src/app.ts`) | System under test (backend) | The app module is exported separately from the server entry point (`src/index.ts`) precisely so tests can import it without binding port 3000. |
| **Real PostgreSQL** | Real database (backend) | Integration tests run against a real PostgreSQL database — never a mock — exercising real Prisma queries, real constraints (unique, cascade deletes), and real SQL aggregation. CI provisions a throwaway database for every run, so the tests behave like production without writing into production data; the shared `DATABASE_URL` is only the last-resort fallback. Mocking Prisma would test our mocks, not our app. |
| **otplib** | TOTP code generation in tests | The 2FA tests generate *genuinely valid* time-based codes with the same library the server uses to verify them, so the full TOTP round-trip is tested end-to-end. |

**Testing pyramid:** the backend has **integration tests** (API-level, real
database) and **unit tests** (pure functions); the frontend has **component
tests** (rendered React components with jsdom) and **unit tests** (pure
logic like saved-filter persistence).

---

## What We Test

1,616 tests in total: 789 backend across 43 files, 827 frontend across 55
files. Line coverage is **85.2% backend** and **80.5% frontend** (October 2026;
see [Coverage](#coverage)). The per-area counts below were taken when each
area was last described and have grown since. Per-file detail for the backend lives in
[`apps/backend/TESTING.md`](https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook/src/branch/main/apps/backend/TESTING.md); the summaries
below cover the whole monorepo.

### Backend — 789 tests across 43 files

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

### Frontend — 827 tests across 55 files

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

- **`savedFilters.test.ts` (15)** — saved filters kept on the account,
  with a localStorage copy for offline use and upload of filters saved offline
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
- **60s per-test and hook timeout** for backend tests — raised from 15s after a loaded CI runner measured a single test at 14.7s and a setup hook at 17s: a slow queue must not fail a run, while a genuine hang still does.

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

> **Give the backend suite a database of its own locally.** The suite creates
> and deletes its own users, projects and entries, so keep it away from your
> development data:
>
> ```bash
> # once: an empty database next to your development one, with the schema
> createdb logbook_test            # or CREATE DATABASE logbook_test;
> (cd apps/backend && DATABASE_URL=postgresql://…/logbook_test npx prisma migrate deploy)
>
> # each run: DATABASE_URL set for the command wins over apps/backend/.env
> DATABASE_URL=postgresql://…/logbook_test npm run test --workspace=apps/backend
> ```
>
> CI gives each run a PostgreSQL database of its own, with its schema built
> from the migrations, so the suite runs in under a minute and never writes
> into shared data. The workflow asks for a service container first; our
> Gitea runner does not provide one, so the step installs PostgreSQL inside
> the job instead. Only if both fail does the run fall back to the database
> in the `DATABASE_URL` repository secret, with fewer workers, and say so in
> a warning: over the network that database has made the suite take 12 to 20
> minutes and fail on query timeouts. The log of the "Choose the test
> database" step says which one a run used.

> **Email behaviour in tests:** with no SMTP credentials configured,
> registration auto-verifies (dev mode) and password-reset emails fail
> silently — both are caught and logged, and the endpoints still behave
> correctly. The tests assert the HTTP contract, never the email delivery.

---

## Coverage

| Workspace | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| Backend | 85.1% | 84.2% | 79.8% | 92.6% |
| Frontend | 80.5% | 78.9% | 76.9% | 76.4% |

*Measured 8 October 2026 with `npm run test:coverage` in each workspace. The
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

Coverage floors are enforced. After months of runs established the baseline,
both configs grew a `thresholds` block: the backend fails below **80% of
lines** — the figure the final rubric asks about — and the frontend below
**78%**, deliberately a little under its current 80.5% because features land
in that workspace faster than their tests, and a floor at exactly 80 would
turn routine feature work red. Either way, a real regression fails the run
instead of waiting for someone to re-read the report.

### The CI database link, and the ETIMEDOUT failures

The backend suites originally ran against the hosted Neon database over the
public internet — now only the last-resort fallback (see the note under
[How to Run Them](#how-to-run-them)). On that path CI failed repeatedly with
`ETIMEDOUT` — a transport error, raised before the statement ever reached
Postgres — landing on an arbitrary query while everything around it read and
wrote to the same database without trouble.

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

## What We Don't Test (and Why)

No suite proves everything; these are the gaps we know about, stated so a
reader knows exactly where the assurance of 1,616 green tests stops.

- **Full user journeys in a real browser.** There are no end-to-end tests
  (Playwright/Cypress) driving the deployed app. Component tests render
  real pages and click real buttons, and the backend suite exercises every
  route they call, but nothing replays a whole journey — sign-in, then
  project, entry, statistics — against a running system. We judged the
  marginal assurance not worth a second test stack and its CI time.
- **The service worker, offline mode and push delivery, on a real device.**
  The offline queue logic is unit-tested (`offlineEntries`,
  `offlineProjects`, `offlineCache`) and the push-subscription endpoints
  are integration-tested, but service-worker registration, background sync
  and notification delivery only truly happen in a browser jsdom does not
  simulate. Those paths are verified by hand, not by CI.
- **Live calls to third-party services.** Google Calendar, the Gemini AI
  assistant and the email providers are mocked at the boundary. Real
  credentials would make the tests slow, non-deterministic, quota-bound
  and occasionally the sender of real email; the tests instead assert the
  behaviour around the boundary — request shaping, token refresh, error
  paths.
- **Performance under load.** The API is rate-limited and queries are
  indexed, but no load test measures throughput or behaviour at
  concurrency. A query that degrades as data grows would not be caught.
- **Known thin spots inside the suites themselves**, left visible in the
  coverage table rather than excluded from it: the two minute-ticker
  background jobs (`jobs/recurringEntries.ts`, `jobs/pushReminders.ts`,
  both 0% — thin `setInterval` wrappers around utilities that are tested),
  the recurring-entry utilities (41% of lines), the Google Calendar routes
  (29%), the email transport (66%) and the server entry point
  (`index.ts`, 0% — it only binds the port). On the frontend the largest
  gap is the animated sign-in background, drawn on a canvas jsdom cannot
  render.

Each is a deliberate trade-off for a course project on a free-tier CI
runner; they are recorded so the judgement can be revisited rather than
rediscovered.

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

Two rounds have been run: Round 1 on 14 September 2026 (Sprint 2, SUS 72.9)
and Round 2 on 28 September 2026 (Sprint 3, SUS 72.5). The results are on the
[User Feedback](user-feedback.md) page.

---

## Proof of Passing Runs

**Run date: 2026-10-11 · 1,616 / 1,616 tests passing · 98 / 98 test files passing**

Both suites captured the same day from `npm run test:coverage` — the backend
against the local PostgreSQL database its `.env` points at, with the coverage
floors (backend 80, frontend 78) active in both configs.

### Backend (789 tests, 43 files)

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

### Frontend (827 tests, 55 files)

```text
 ✓ src/__tests__/api.test.ts (30 tests) 272ms
 ✓ src/__tests__/gradesApi.test.ts (6 tests) 94ms
 ✓ src/api/__tests__/client.test.ts (10 tests) 93ms
 ✓ src/components/__tests__/AppLayout.test.tsx (5 tests) 5008ms
 ✓ src/components/__tests__/AutomationRules.test.tsx (25 tests) 9247ms
 ✓ src/components/__tests__/BarChart.test.tsx (4 tests) 1356ms
 ✓ src/components/__tests__/DeleteProjectModal.test.tsx (16 tests) 6851ms
 ✓ src/components/__tests__/EntryForm.test.tsx (18 tests) 8939ms
 ✓ src/components/__tests__/EntryHistoryModal.test.tsx (20 tests) 14548ms
 ✓ src/components/__tests__/GoogleCalendarSync.test.tsx (3 tests) 1987ms
 ✓ src/components/__tests__/HelpAssistant.test.tsx (6 tests) 4935ms
 ✓ src/components/__tests__/LandingPage.test.tsx (3 tests) 4902ms
 ✓ src/components/__tests__/LoginStage3D.test.tsx (7 tests) 3047ms
 ✓ src/components/__tests__/ProtectedRoute.test.tsx (3 tests) 389ms
 ✓ src/components/__tests__/ReferencePicker.test.tsx (8 tests) 1798ms
 ✓ src/components/__tests__/Sidebar.test.tsx (7 tests) 6459ms
 ✓ src/components/__tests__/TrendChart.test.tsx (4 tests) 641ms
 ✓ src/components/__tests__/displayComponents.test.tsx (21 tests) 4979ms
 ✓ src/components/__tests__/interactiveComponents.test.tsx (26 tests) 5122ms
 ✓ src/lib/__tests__/appearance.test.ts (7 tests) 49ms
 ✓ src/lib/__tests__/csvExport.test.ts (4 tests) 29ms
 ✓ src/lib/__tests__/dashboardInsights.test.ts (13 tests) 256ms
 ✓ src/lib/__tests__/dashboardPreferences.test.ts (6 tests) 25ms
 ✓ src/lib/__tests__/encouragement.test.ts (3 tests) 32ms
 ✓ src/lib/__tests__/entryDefaults.test.ts (6 tests) 81ms
 ✓ src/lib/__tests__/formulas.test.ts (16 tests) 116ms
 ✓ src/lib/__tests__/gradeDisplay.test.ts (18 tests) 104ms
 ✓ src/lib/__tests__/grades.test.ts (93 tests) 1268ms
 ✓ src/lib/__tests__/offlineCache.test.ts (7 tests) 110ms
 ✓ src/lib/__tests__/offlineEntries.test.ts (18 tests) 137ms
 ✓ src/lib/__tests__/offlineProjects.test.ts (15 tests) 171ms
 ✓ src/lib/__tests__/profileActivity.test.ts (32 tests) 127ms
 ✓ src/lib/__tests__/quickCapture.test.ts (10 tests) 69ms
 ✓ src/lib/__tests__/reminderNotifications.test.ts (10 tests) 235ms
 ✓ src/lib/__tests__/savedFilters.test.ts (15 tests) 66ms
 ✓ src/lib/__tests__/today.test.ts (8 tests) 78ms
 ✓ src/lib/__tests__/utils.test.ts (11 tests) 112ms
 ✓ src/pages/__tests__/AuthPages.test.tsx (11 tests) 3726ms
 ✓ src/pages/__tests__/BoardPage.test.tsx (15 tests) 4285ms
 ✓ src/pages/__tests__/CalendarPage.test.tsx (22 tests) 51216ms
 ✓ src/pages/__tests__/DashboardPage.test.tsx (30 tests) 32943ms
 ✓ src/pages/__tests__/EntriesPage.test.tsx (23 tests) 17223ms
 ✓ src/pages/__tests__/GradeModulePage.test.tsx (21 tests) 22533ms
 ✓ src/pages/__tests__/GradesPage.test.tsx (24 tests) 16386ms
 ✓ src/pages/__tests__/LoginPage.test.tsx (5 tests) 7521ms
 ✓ src/pages/__tests__/LoginFlow.test.tsx (9 tests) 14986ms
 ✓ src/pages/__tests__/OpenWorkPage.test.tsx (24 tests) 12317ms
 ✓ src/pages/__tests__/PrivacyPage.test.tsx (1 test) 1423ms
 ✓ src/pages/__tests__/ProfilePage.test.tsx (6 tests) 6366ms
 ✓ src/pages/__tests__/ProjectDetailPage.test.tsx (7 tests) 7427ms
 ✓ src/pages/__tests__/ProjectsPage.test.tsx (25 tests) 18905ms
 ✓ src/pages/__tests__/RegisterPage.test.tsx (7 tests) 8611ms
 ✓ src/pages/__tests__/RemindersPage.test.tsx (20 tests) 11585ms
 ✓ src/pages/__tests__/SettingsPage.test.tsx (18 tests) 13455ms
 ✓ src/pages/__tests__/StatsPage.test.tsx (45 tests) 50608ms

 Test Files  55 passed (55)
      Tests  827 passed (827)
   Duration  112.94s (transform 19.74s, setup 40.67s, import 61.71s, tests 385.25s, environment 218.37s)
```

### Coverage (V8 provider, from the same runs)

| Suite | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Backend | 84.23% | 79.79% | 92.7% | 85.16% |
| Frontend | 78.87% | 76.89% | 76.04% | 80.53% |
| **Combined (lines)** | | | | **82.10%** (6,819 of 8,306) |

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

- **Test isolation:** CI now gives every backend run a PostgreSQL database of its own (with the `DATABASE_URL` secret kept only as a fallback), but the suites within one run still share that database and clean up after themselves via user-cascade deletion. A per-suite schema or transaction-rollback strategy would make it impossible for suites to observe each other's data at all.

### Completed

- **CI gate** — the Gitea Actions workflow runs both backend and frontend test suites on every push to `main`, `master`, `Alondwe` and `Dineo`. It needs a Gitea Actions runner to be online; while none is, runs wait in the queue and start once one returns.
- **Per-run test database** — CI provisions a throwaway PostgreSQL for each backend run, so test data never lands in the production Neon database.
- **Coverage floors** — the backend fails below 80% of lines and the frontend below 78%; a regression below the floor turns CI red rather than waiting for someone to re-read the report.
- **Backend linting in CI** — ESLint runs on the backend alongside the frontend's oxlint; `no-explicit-any` is warn-only at the untyped Prisma/raw-SQL boundary, everything else is an error.
- **Backend unit tests** — utils tests cover computedFields, auth, and entryFormat.
- **Frontend component and UI tests** — page-level tests cover the dashboard, login/register, projects, entries timeline, open work, calendar, statistics and reminders pages, alongside the component and offline-layer suites.
- **Rate-limiting tests** — `rateLimit.test.ts` locks in the BUG-003 fix.

---

*Related: [Third-Party Code](third-party.md) documents the testing
libraries and their licences, and [Database Design](design/database-erd.md)
describes the schema the integration tests run against.*
