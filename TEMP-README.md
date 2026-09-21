# Digital Logbook — Temporary Status Readme

> **TEMPORARY FILE — internal tracking only. Delete before final hand-in.**
> A plain-language summary of what has been done on the Digital Logbook, what the
> client asked for, what is currently failing, and where. Covers the recent
> workstreams: features, bug fixes, testing, CI and documentation.

**Project:** Digital Logbook — COMS3011A Software Design Project
**Last updated:** 21 September 2026
**Repository:** sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook (working branch: `Dineo`)

---

## 1. What the app is

A digital logbook application: users track projects and logbook entries, log time
with a stopwatch, organise work with tags and filters, and view statistics,
calendars and deadlines.

- **Frontend:** React + Vite + Tailwind CSS (deployed via Cloudflare Pages)
- **Backend:** Express + TypeScript + Prisma (deployed; production build runs the compiled server)
- **Database:** PostgreSQL hosted on Neon (cloud-hosted, connected over the public internet from both local machines and CI)
- **CI/CD:** Gitea Actions (`.gitea/workflows/deploy.yaml`) — typecheck, lint, full test suites, coverage reporting, builds
- **Docs:** MkDocs site under `docs/`; per-app guides `apps/backend/TESTING.md` and `apps/backend/AUTHENTICATION.md`

## 2. How the work was done

Development was AI-assisted: one AI assistant implemented each change, and a
second AI assistant independently verified it before anything was pushed — the
backend typecheck, ESLint, the full backend and frontend test suites, and both
production builds all had to pass locally first. Commits follow Conventional
Commits and are only pushed after verification. That is why most items below
carry a verified status.

Note on scope: almost all of the work below is verified through actual test
runs, CI logs and coverage reports. Two bullets near the end are explicitly
marked as unverified and need a human check.

## 3. Delivered and verified

### Bug fixes

- **Dashboard "New Entry" button did not open entry creation.** Fixed: it now
  opens the first active project's detail page (falls back to the Projects page
  when no projects exist).
- **N+1 query fan-out in list views (BUG-014).** Fixed with an additive,
  user-scoped entries endpoint instead of enriching the projects response;
  landed across four commits, issue tracker updated with the resolution.
- **Session handling on expired/invalid tokens.** The frontend now clears the
  local session and redirects to login on a 401; covered by tests.
- **Entry ownership checks.** Regression on entry ownership was fixed and is
  now covered by dedicated tests.
- **Missing tags database tables** (client-reported blocker for tag features).
  Tags are now modelled in Prisma (Tag, ProjectTag, EntryTag) and persisted
  through the API.
- **CI infrastructure bugs:** frontend tests failing on the CI runner due to the
  Node version (fixed by pinning the expected version); lint step failing due to
  a missing native binding in the lockfile for Linux (fixed); duplicate test
  runs caused by the Vitest config picking up compiled `dist/` files (fixed with
  an explicit include pattern); coverage statuses never appearing on commits
  (fixed with `if: always()` on test/report steps plus a coverage reporting
  script).

### Testing

- Backend test suite grown to **170 tests across 12 suites** (from 78); all
  pass locally at ~78.5% line coverage.
- Frontend test suite created from scratch and grown to **210 tests**; all pass
  locally and on CI.
- Both suites now run on every push to the repository via the CI workflow.

### Coverage reporting

- Every CI run publishes coverage statuses onto the commit: `coverage/backend`,
  `coverage/frontend`, `coverage/combined`. Current published values: backend
  73.82%, frontend 43.75%, combined 51.59% (see section 6 for why the backend
  number is capped).

### Documentation

- `TESTING.md` rewritten to match the real test suite; `AUTHENTICATION.md`
  added covering the auth, 2FA, verification and password-reset flows.
- API reference page published on the docs site; user-feedback page and SUS
  data collection prepared; database ERD refreshed; third-party documentation
  updated.
- Gitea issue tracker maintained in-house: BUG-014 marked Fixed with resolution
  evidence; FEAT-007 closed as a duplicate; FEAT-001 (Google Calendar)
  corrected to Partial; issue templates added.

## 4. Client feedback (18 Sep 2026 review) — status

| # | Client request | Status |
|---|----------------|--------|
| 1 | Investigate moving deployment (Cloudflare Pages / Render to Vercel) | **Not started** |
| 2 | Adopt MantisBT as the formal bug tracker | **Not started** |
| 3 | Remove duplicated statistics section from the Dashboard | **Unverified** — may have changed with the stats page redesign; needs a quick check |
| 4 | Add the missing tags database tables (blocked tag features) | Done in code; production database migration status unconfirmed |
| 5 | Investigate frontend–backend glitches / latency | Partially addressed (local API proxy restored for development); production builds still point at the hosted backend |
| 6 | Internal API documentation (endpoints, requests, responses) | API reference page published; full coverage of every endpoint not verified |
| 7 | CI/CD with automated tests and code coverage | **Implemented** — tests and coverage reports run on every push; currently red on the backend test step (section 6) |

## 5. Testing status today

- **Backend:** 170 tests / 12 suites — all pass locally.
- **Frontend:** 210 tests — all pass locally and **green on CI**.
- **On CI:** 156 of 170 backend tests pass. The remaining 14 are in the one
  suite that fails to start (below). All 210 frontend tests pass on CI.

## 6. The one failing thing: the backend test step on CI

### Where exactly it fails

- **CI step:** "Run backend tests with coverage" in `.gitea/workflows/deploy.yaml`.
- **Failing suite:** `apps/backend/src/__tests__/entriesListing.test.ts`.
- **Failing point:** the suite's setup hook — its **first database write**,
  `prisma.user.create(...)` in the test fixture (`makeUser`).
- **Error:** `PrismaClientKnownRequestError`, code **`ETIMEDOUT`** — a
  transport-level connection failure. The request never reaches Postgres.

**Consequence:** the step exits red, so the two build steps after it
("Build Backend", "Build Frontend") never run on CI — they only execute when
every earlier step has passed.

### Why we are confident it is not the application or test logic

- The same file passes every time locally, and the failure always lands on the
  same file, ~4.6 seconds into its first database write.
- Two theories were tested and eliminated:
  - **Connection-pool pressure** — capping the test workers (peak concurrency
    cut to a third) did not move the failure at all.
  - **Database cold start** — timestamps from the latest run show other suites
    reading and writing the same database just before and while this suite
    times out (one suite finished at ~1.9s; another's first write took ~1.6s).
    The database was awake.
- What remains is the CI runner's network link to the cloud-hosted database
  dropping the occasional connection — and it lands on the suite that reaches
  the database earliest and most directly.

### What is being done about it

- The fixture now retries **only transport-level error codes** (`ETIMEDOUT`,
  `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, and Prisma's `P1001`/`P1002`/`P1017`)
  with backoff. Every other error — including a constraint violation — still
  fails immediately, so the retry cannot hide a real bug.
- Two safety details: user creation in the fixture became an **upsert** (a write
  that timed out may still have landed); the seed insert is **guarded by a row
  count** so a retry cannot double-insert and corrupt later assertions.
- This fix is committed and **awaiting CI validation** on the next run.

### If it still fails in the same place

The durable fix is an **infrastructure change**: run CI against a database in
the same network as the CI runner instead of across the public internet. That is
a deployment decision, not a code change.

## 7. Known limitations / cannot be fixed in application code

- **Code coverage is capped on CI while the backend step is red.** Locally the
  backend reaches 78.51% (636/810 lines); CI shows 73.82% (598/810). The entire
  difference is exactly the 38 lines belonging to the failing suite. Combined
  coverage currently reads 51.59% and is expected to rise to about 52.8% once
  the backend step passes on CI.
- **The CI connection flakiness itself** (section 6) is a network-level problem
  between the CI runner and the hosted database. If the retry fix does not hold
  across runs, it cannot be fixed in application code — it needs the
  infrastructure route (same-network database).
- **Google Calendar integration is partial** — the OAuth connection works, but
  the sync endpoint is a stub; only the manual "Add to Google Calendar" link
  works. Tracked as FEAT-001 (Partial).
- **Vercel migration investigation and MantisBT adoption** — client items 1 and
  2, not started.
- **Production migration of the tags tables** — unconfirmed.

## 8. Overall health

- The deployed application itself runs and is healthy for end users. The failing
  item is the **CI test environment's connection to the database**, not the
  application.
- Full local pass: 170/170 backend + 210/210 frontend tests, typechecks, lint
  and production builds.
- On CI: 156/170 backend and 210/210 frontend tests pass, in addition to
  published coverage reports on every run.

---

**Key places to look:** `.gitea/workflows/deploy.yaml` (CI), `.gitea/issues/`
(issue tracker), `apps/backend/TESTING.md` and `docs/testing.md` (test docs),
`apps/backend/AUTHENTICATION.md` (auth), `docs/` (site: user feedback, API
reference, ERD, methodology).
