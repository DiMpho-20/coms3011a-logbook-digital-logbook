# Full-App Audit — Round 2, November 2026

**Repository:** `coms3011a-logbook-digital-logbook`
**Branch:** `main` at `e0605be` (`docs: group the reference documentation into subject folders`)
**Date:** 2026-11-25
**Previous audit:** [`audit-2026-11-25.md`](audit-2026-11-25.md) — its P0/P1 items and P3-3/P3-4 are
closed; this pass re-measures everything and looks for what that pass did not cover (the running
deployment, the production image, and the client's request paths).

**Method:** each claim below comes from one of four sources, named beside it: reading the file,
running the project's own tooling (`npm run build`, `npm run lint`, `npm test`), `curl` against the
live deployment, or `git` history. Nothing is copied forward from the earlier audit. Section 7 says
what was deliberately not checked.

---

## 1. Measured state

| Check | Result | How |
|---|---|---|
| Shared package build | pass | `npm run build --workspace=packages/shared` |
| Backend build (`tsc`) | pass | `npm run build --workspace=apps/backend` |
| Frontend build (`tsc -b && vite build`) | pass, 2.1 s | `npm run build --workspace=apps/frontend` |
| Frontend bundle | 172.81 kB main + 229.06 kB React vendor + 81.59 kB CSS | build log |
| Backend lint | **0 errors, 85 warnings** (`no-explicit-any`) | `npm run lint` |
| Frontend lint (oxlint) | **0 warnings, 0 errors**, 215 files | `npm run lint` |
| Backend tests | **816 passing, 45 files**, 70.5 s | `npm test --workspace=apps/backend` |
| Frontend tests | **830 passing, 55 files**, 166.7 s | `npm test --workspace=apps/frontend` |
| **Total** | **1,646 tests in 100 files** | both runs, same session |
| Live app | `200` on `/` and on `/dashboard` | `curl`, SPA fallback is working |
| Live API | `200 {"status":"ok"}` on `/api/health` | `curl` |
| Code size | backend 9,201 lines / 73 files; frontend 24,578 / 156; shared 525 | `wc -l` |
| Surface | 88 route registrations, 89 documented endpoints, 23 Prisma models | `grep`, `prisma/schema.prisma` |
| History | 575 commits, 33 since the `79903cb` marking cut-off | `git rev-list` |
| Local run | API on `:3000` and SPA on `:5173`, both serving | see §7 |

---

## 2. Severity summary

| ID | Finding | Severity |
|---|---|---|
| P2-1 | The frontend origin has no CSP and no clickjacking protection | High |
| P2-2 | The production image installs from a third-party npm mirror | Medium |
| P2-3 | The live deployment is the `79903cb` cut-off, not `main` | Medium |
| P3-1 | Three frontend scripts point at a `server/` directory that does not exist | Low |
| P3-2 | 85 `no-explicit-any` warnings, six of them on raw SQL rows | Low |
| P3-3 | Nine modules remain over 600 lines | Low |
| P3-4 | Search is an unindexed `ILIKE '%term%'` scan | Low |
| P3-5 | No request cancellation on the client | Low |
| P3-6 | `.env.production` is tracked and empty | Low |
| P3-7 | The list ordering has no index behind it | Low |
| P3-8 | 107 `console.*` calls, no levels or timestamps | Low |
| P3-9 | The frontend suite takes 167 s locally | Low |
| P3-10 | The API reference is hand-maintained, with no generated spec | Low |
| P3-11 | Unknown entry field keys are dropped silently, with a `201` | Low |

Nothing in this pass is P0 or P1: both suites are green, both builds are clean, and the checks the
previous audit added (helmet, JSON 404, global error handler, CORS allowlist, ownership checks,
revocable tokens) are all present in the code. Every one of those was also confirmed against the
running server, not just read — see §7.

---

## 3. P2 — worth fixing before the next demo

### P2-1. The frontend origin sends no CSP and no frame protection

`curl -I https://coms3011a-logbook.pages.dev/` returns Cloudflare's defaults —
`x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`,
`cache-control` — and nothing else. There is no `Content-Security-Policy`, no
`X-Frame-Options` or `frame-ancestors`, no `Strict-Transport-Security` and no `Permissions-Policy`.

The session token is kept in `localStorage` (`apps/frontend/src/api/client.ts:21`), so script
injection into the app origin is the one path to token theft, and the app origin is the one place
with no header standing in the way. The API does send helmet's headers, but those govern API
responses, not the document that runs the JavaScript.

**Fix:** add `apps/frontend/public/_headers` — Cloudflare Pages applies it to the static build:

```text
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://digital-logbook-backend-latest.onrender.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`style-src 'unsafe-inline'` is needed by Tailwind's inline style attributes; the rest needs no
loosening, because the app loads no third-party scripts. Test the production build locally with
`npm run preview` after adding it — a CSP that is too tight fails loudly in the console.

### P2-2. The production image installs from `registry.npmmirror.com`

`Dockerfile:9` runs `npm config set registry https://registry.npmmirror.com` before every install in
the image. Nothing explains it, it is not overridable, and it applies to the whole dependency tree
rather than one package. That mirror is a third party: the image's contents then depend on its
availability and on it serving the same tarballs as the public registry.

**Fix:** remove the line. If it was there to work around a slow or blocked registry on the build
host, make it explicit and optional:

```dockerfile
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry "$NPM_REGISTRY"
```

### P2-3. The live deployment is the cut-off snapshot, not `main`

The deployed API does not carry helmet's headers — `x-powered-by: Express` is still advertised and
there is no `nosniff` or CSP — while `apps/backend/src/app.ts:36` has called `helmet()` since
`d6f1df1`. That commit is one of the 33 made after the `79903cb` marking cut-off, and
`.github/workflows/ci.yml` typechecks, lints, tests and builds but deliberately does not deploy
(only `.gitea/workflows/deploy.yaml` does).

So the deployment matches the submitted snapshot, as marked, and none of the post-cut-off work is
live: helmet, the CORS allowlist rework, the JSON 404, the global error handler, the five split
pages and the documentation reorganisation.

**Decision to record, not a bug to fix:** either re-deploy before any demonstration that cites
`main`, or say "the live build is the submitted snapshot" wherever the live URLs are given. Do not
let the README imply that what is deployed is what is on `main`.

---

## 4. P3 — tidy-ups, in the order they would pay off

### P3-1. Three frontend scripts are dead

`apps/frontend/package.json` declares `dev:server`, `build:server` and `start:server`, all pointing
at `apps/frontend/server/index.ts`. That directory does not exist, so each script fails on
invocation. Delete the three entries (or restore the server if it was meant to be there).

### P3-2. 85 `no-explicit-any` warnings

`eslint` reports 0 errors and 85 warnings; the frontend reports none. Six of the warnings are in
`stats.controller.ts`, where `const rows: any[] = await prisma.$queryRawUnsafe(...)` covers the
result of hand-written SQL — the riskiest six, because a column rename would not be caught. The
rest are `catch (error: any)` blocks reading `.message`. Typing the six raw rows as
`{ key: string; value: bigint | number }[]` removes the ones that matter; the rest are cosmetic and
warn-only by an earlier decision.

### P3-3. Nine modules remain over 600 lines

The page split closed the five 900+ line pages; these are what is left:

| File | Lines |
|---|---|
| `apps/backend/src/controllers/entry.controller.ts` | 867 |
| `apps/frontend/src/pages/LoginPage.tsx` | 864 |
| `apps/frontend/src/api.ts` | 827 |
| `apps/backend/src/routes/auth.routes.ts` | 685 |
| `apps/frontend/src/pages/ProfilePage.tsx` | 679 |
| `apps/frontend/src/pages/RemindersPage.tsx` | 646 |
| `apps/frontend/src/pages/ProjectsPage.tsx` | 623 |
| `apps/frontend/src/components/AutomationRules.tsx` | 617 |
| `apps/frontend/src/pages/OpenWorkPage.tsx` | 610 |

`api.ts` and `LoginPage.tsx` are the two that would benefit most, and both can be split the same way
the earlier five were: `api/` per domain (entries, projects, stats, grades, calendar) and
`pages/login/` with the password, 2FA and recovery-code panels as separate components.

### P3-4. Search is an unindexed scan

`listEntries` builds `... ILIKE '%term%'` over `projects.name`, `entry_values.value` and tag names
(`entry.controller.ts:577-590`), and `entry_values` has no trigram index. A leading wildcard cannot
use a B-tree index, so every search reads the rows it filters. At a few thousand entries this is
invisible; at a few hundred thousand it will not be. If search ever needs to scale, add
`pg_trgm` and a GIN index on `entry_values.value`, and start the query at three characters.

### P3-5. No request cancellation

The client has 113 `useEffect`s and no `AbortController`; seven of them hand-roll a `cancelled`
flag. Where no flag exists, an older response can land after a newer one (type in the search box,
change project, change the tab) and overwrite fresh state with stale data. Axios accepts
`signal` on every call, so the pattern is cheap to adopt in `cacheKeyFor`-style loaders first.

### P3-6. `.env.production` is tracked and empty

`apps/frontend/.env.production` is a zero-byte tracked file. A production build therefore falls
back to the hard-coded Render URL in `client.ts:7`, or takes `VITE_API_URL` from the Pages
environment. Either is fine; an empty file that looks like configuration is not. Fill it with the
public API URL or delete it.

### P3-7. The list ordering has no index behind it

`logbook_entries` indexes `projectId`, `status`, `dueDate` and `(projectId, status)`. The listing
filters `archived_at IS NULL` and orders by `COALESCE(entry_date, created_at)`, so the sort cannot
use an index and the archive filter has none. `@@index([projectId, entryDate])` would serve the
common "this project, newest first" case if the query ever stops wrapping `entry_date` in
`COALESCE`.

### P3-8. 107 `console.*` calls

There is no logger: 107 `console.log/error/warn` calls in the backend, and only the global error
handler prefixes a line with the request that caused it. Acceptable for a course project; the first
thing to change if this ever runs for real users.

### P3-9. The frontend suite takes 167 s

830 tests in 166.7 s locally, with `CalendarPage` (51 s), `StatsPage` (50 s) and `DashboardPage`
(33 s) accounting for most of it. These are the date- and timer-driven pages; `vi.useFakeTimers()`
in their setup would cut wall time substantially and remove the class of failure the P0-1 fixture
had.

### P3-10. The API reference is hand-maintained

`docs/api/reference.md` documents 89 endpoints against 88 route registrations — close, and verified
by eye rather than by tooling. There is no OpenAPI document, so every new route depends on whoever
writes it remembering to document it. Generating a spec from the Zod schemas would close that gap;
until then, adding an endpoint means updating the reference in the same commit.

### P3-11. Entry values for unknown fields are dropped without a word

`createEntry` keeps only the values whose key matches a live field id and is not computed
(`entry.controller.ts:261`), then answers `201`. A client that keys its payload by field *name*
(`{"Hours": 2}` rather than `{"<field-id>": 2}`) gets a success response and an entry with no
values; so does a client holding a stale field id after a format change.

The SPA always sends ids (`lib/utils.ts:79-82` builds the map from `f.id`), so this never bites
the product as shipped. It is still a data-loss path for anything else speaking to the API, and
the fix is one line — compare the dropped keys against the supplied ones and answer `400
"Unknown field: Hours"`. Do it before a second client exists.

---

## 5. What the code already gets right

Verified in this pass, and worth not undoing:

- **Authorization is per-resource.** Every controller looks the resource up through the signed-in
  user (`ownedProject`, `ownedEntry`), so a valid token for another account returns 404, not 403
  with data.
- **Tokens are revocable.** `requireAuth` compares the token's `tokenVersion` with the row, so
  signing out or resetting a password ends every other session.
- **Input is validated at the edge.** Zod schemas per route; query parameters are checked by hand
  with explicit 400s (`listEntries` validates `limit`, `offset`, `from`, `to`, `sort`, `archived`,
  `entryTab`).
- **SQL is parameterised, including the raw queries.** The one `$queryRawUnsafe` in
  `stats.controller.ts` interpolates only an aggregate chosen from a five-item allowlist.
- **No dynamic code.** No `eval`, no `new Function`, no `vm`; the expression engine is a hand-written
  parser, which is why custom statistics cannot become code execution.
- **No HTML injection sinks.** No `dangerouslySetInnerHTML` anywhere in the frontend.
- **Failures do not leak.** 5xx responses return a constant message and log the detail; 4xx messages
  are the caller's to read.
- **The build is clean and the lint gate is honest.** 0 lint errors both sides, 0 TODOs/FIXMEs in
  source, both builds green, and no dependency is missing from `package.json`.
- **The client is split.** Every page but the landing and login screens is lazy-loaded; the initial
  payload is 172.81 kB of app code plus a 229.06 kB React vendor chunk.

---

## 6. Recommended order

1. **P2-1** `_headers` with a CSP — one file, protects the token that everything else depends on.
2. **P2-2** drop or parameterise the npm mirror — one line, and it is in the image that ships.
3. **P2-3** decide what "deployed" means and say it in the README.
4. **P3-1** delete the three dead scripts (one minute).
5. **P3-6** fill or delete `.env.production` (one minute).
6. **P3-2** type the six raw-SQL rows.
7. **P3-5** adopt `AbortController` in the loaders that already take a cache key.
8. **P3-3** split `api.ts`, then `LoginPage.tsx`.
9. **P3-9** fake timers on the three slowest page suites.
10. Everything else when the record gets big enough to need it.

---

## 7. The run

The audit ended with the application actually running, not just read. Both processes were started
with `npm run dev` against the local PostgreSQL instance, and every claim below is a response that
came back:

| Exercise | Result |
|---|---|
| `GET /api/health` | `200 {"status":"ok"}`, with helmet's headers, no `x-powered-by` |
| Unknown route | `404 {"error":"Not found"}` as JSON, not HTML |
| Login as the seeded demo account | `200`, token issued |
| 16 authenticated reads — projects, the cross-project listing (default, both sort orders, search), open work, time summaries, reminders, tags, grades, dashboard layout, profile, and per-project entries, rules, statistics and time summary | all `200` |
| No token / malformed token | `401` both |
| Another account's project (4 sub-resources) | `404 "Project not found"` — no data, no 403 oracle |
| `Origin: https://evil.example` | `200` with **no** `Access-Control-Allow-Origin` |
| `Origin: http://localhost:5173` | echoed back in `Access-Control-Allow-Origin` |
| `sort=recent` | `400 "sort must be newest or oldest"` (hand validation fires) |
| Create project → field → two entries → group `sum` → expression `SUM({Hours}) + 1` | `201`, `201`, `3.5`, `4.5` |
| Duplicate field name | `409` |
| Delete both entries and the project | `200` `200` `200`, project count back to its starting value |
| SPA `/` and `/dashboard`, and `/api/health` through the Vite proxy | served; proxy forwards correctly |

The create-project row is what found P3-11: the entry created with a name-keyed payload came back
with `values: {}` and a `201`. The four paths that answered `404` on the first sweep were wrong
paths of mine, not missing routes — the same endpoints answered `200` once given their real
project-scoped URLs.

---

## 8. What this audit did not check

- **No end-to-end or visual pass.** The app was started locally and the API exercised, but no
  browser automation drove the UI; the live site was checked with `curl` only.
- **No accessibility scanner.** The code has 316 `aria-*` attributes and a skip link, but no
  axe/WAVE run was performed, so the `outline-none` occurrences (34) have not been checked one by
  one for a visible focus ring.
- **No load or performance test.** Query plans were read, not measured.
- **No penetration test.** The findings above are code and header review, not exploitation.
- **The deployed build was not compared file by file with `main`.** The inference in P2-3 rests on
  the missing helmet headers and on the deploy workflow's trigger.
