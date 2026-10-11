# Feature Audit — September 2026

**Repository:** `coms3011a-logbook-digital-logbook`
**Branch:** `Dineo` at `7d0af0a`, level with `origin/main`
**Date:** 2026-09-20
**Method:** code-level verification against the working tree, both test suites run on the development machine, and a manual walkthrough against local dev servers (backend on 3000, Vite on 5173) signed in as the project owner. Every verdict was reached by reading the file or exercising the feature named beside it.

---

## 1. Purpose

This audit establishes what works before the UI transformation begins, so a regression introduced later can be told apart from a defect that was already there. It also re-checks the ten bugs and eight features recorded in `.gitea/issues/`.

## 2. Test suites

Both suites pass in full. Run on the development machine on 2026-09-20; they cannot be run from the audit environment, because the organisation's egress policy blocks `registry.npmjs.org` and TCP 5432 to the Neon host, and the installed `node_modules` are Windows binaries.

| Suite | Files | Tests | Result |
|---|---|---|---|
| `apps/backend` | 7 | 130 | 130 passed, 0 failed (94.13s) |
| `apps/frontend` | 8 | 65 | 65 passed, 0 failed (12.25s) |

The known flaky TOTP timing test did not fail on this run. The previously recorded expectation of "100 backend tests" is out of date; the suite has grown to 130.

Four warnings are worth acting on even though nothing failed. The `pg` driver reports that `sslmode=require` in the Neon connection string is currently treated as `verify-full` and will adopt weaker libpq semantics in `pg` v9 — a one-word change to the connection string settles it before that lands. A `client.query() when the client is already executing a query` deprecation fires across several suites. The frontend suites emit React `act(...)` warnings in `EntryForm`, `LoginPage` and `RegisterPage`, meaning those assertions race their state updates. And jsdom cannot implement `getContext()`, so every canvas render bails — the chart components are effectively untested, which matters before Phase B restyles them.

## 3. BUG-011 — No ownership checks on the entry and statistics APIs

**Severity:** High (broken access control). **Component:** `apps/backend/src/controllers/entry.controller.ts`, `apps/backend/src/controllers/stats.controller.ts`.

`getEntries` (entry.controller.ts:74) queries `where: { projectId }` with no `userId` term. `createEntry` (:126) resolves the project with `findUnique({ where: { id: projectId } })` alone. `deleteEntry` (:263) and `updateEntryStatus` (:96) perform no ownership check at all. `updateEntry` (:177) reads `project.userId` but uses it only to resolve tag ownership, never comparing it to `req.userId`. All five are typed `req: Request`, not `AuthenticatedRequest`.

The same omission appears in stats.controller.ts: `groupStats` (:6) and `timelineStats` (:91) are typed `req: Request`, so they cannot read `req.userId` even in principle, and their `entryField` lookups are scoped by `projectId` only.

The routes are wrapped in `requireAuth` (entry.routes.ts:14-20), but that middleware establishes only that the caller holds a valid JWT, not that the caller owns the resource named in the path. Any authenticated account can therefore read, modify, delete and aggregate another account's entries given an ID, and project IDs appear in the address bar on `/projects/:id`.

**Why it was not previously recorded:** the backlog was assembled from a code scan for TODOs and security patterns, from AUTHENTICATION.md's documented limitations, and from the commit history. An authorisation check that is simply absent leaves no pattern to scan for and no comment to read. `project.controller.ts` and `entryField.controller.ts` both scope correctly by `userId`, so the codebase looks consistent until these two files are compared against them directly.

## 4. BUG-012 — A blank numeric field breaks every aggregation and leaks the database error

**Severity:** High. **Component:** `apps/frontend/src/lib/utils.ts`, `apps/backend/src/utils/entryValues.ts`, `apps/backend/src/controllers/stats.controller.ts`.

Reproduced end to end during the walkthrough. The chain is five steps, each individually defensible:

1. `defaultValuesForFields` (frontend/src/lib/utils.ts:74-86) seeds every field the user has not touched, and its `else` branch at :83 assigns `""` — so an untouched NUMBER field is submitted as an empty string.
2. `checkValueShape` (backend/src/utils/entryValues.ts:18) returns `null` for any empty value before reaching the NUMBER branch, so `""` passes validation without a type check.
3. `createEntry` (backend/src/controllers/entry.controller.ts:158-161) writes the value through `String(value ?? "")`, storing an `EntryValue` row whose `value` is the empty string.
4. `groupStats` (backend/src/controllers/stats.controller.ts:40) builds its metric expression by casting `(mv.value)::numeric` with no guard, and `timelineStats` (:134) does the same for `SUM`. Postgres raises `22P02 invalid input syntax for type numeric: ""` and the endpoint returns 500.
5. `flattenValues` (backend/src/controllers/entry.controller.ts:23) renders a stored `""` as `Number(ev.value) || 0`, i.e. `0`, so the entry list shows a tidy "Hours: 0" and nothing looks wrong until the statistics page is opened.

Sum, average, min and max on that field are all dead until the row is corrected. Verified live: with one entry holding Hours = 3 and one holding `""`, all three of `avg`, `min` and `sum` returned HTTP 500.

There is a second defect inside the first. `StatsPage.tsx:145` and `:170` render `err?.response?.data?.error` verbatim, and the backend's catch block passes `error.message` through unchanged, so the user is shown the literal text `Invalid prisma.$queryRawUnsafe() invocation: Raw query failed. Code: 22P02. Message: invalid input syntax for type numeric: ""` inside a red panel. An internal database error reaches the interface.

Worth noting when fixing: `utils/entryFormat.ts:53-69` carries a long comment explaining, correctly, that `backfillNewField` refuses to fabricate a `0` for pre-existing entries because doing so "would silently drag the average down and force the min to 0". The entry form then does exactly that for every newly created entry. Whichever way this is fixed — storing nothing for an untouched field, or guarding the cast in SQL — the two halves should end up agreeing.

**Why it was not previously recorded:** it needs three files to be read together, and the symptom is invisible in the entry list because step 5 masks it as a clean `0`. The backend tests cover numeric validation (`entryValidation.test.ts` asserts a non-numeric value is rejected) but no test creates an entry that simply leaves a NUMBER field alone and then aggregates over it.

## 5. BUG-013 — Duplicate React keys in the project field editor

**Severity:** Medium. **Component:** `apps/frontend/src/pages/ProjectsPage.tsx`.

`addField` (:139) creates each new row with ``id: `new-${Date.now()}` ``, and the rows are rendered with `key={field.id}` (:383). Two "+ Add Field" clicks landing in the same millisecond therefore produce two rows with an identical key. React's reconciliation is undefined in that case — it may duplicate or omit rows.

Reproduced: rapid repeated clicking on "+ Add Field" produced fifteen rows from nine clicks, with the console logging `Encountered two children with the same key, new-1789920217358`. The same ids double as identity for removal (`:148` tests `id.startsWith("new-")`), so a collision affects deletion as well as rendering.

A counter, `crypto.randomUUID()`, or index-free stable ids would all fix it.

**Why it was not previously recorded:** it only surfaces under fast repeated clicks, which a manual tester adding fields one at a time will never trigger, and the frontend suite has no test for the field editor.

## 6. BUG-014 — Project and entry lists fan out one request per project and block on all of them

**Severity:** Medium (performance). **Component:** `apps/frontend/src/pages/ProjectsPage.tsx`, and the same shape in `DashboardPage.tsx` and `EntriesPage.tsx`.

`loadProjects` (ProjectsPage.tsx:63-93) sets `loading` true, awaits `fetchProjects()`, then awaits a `Promise.all` over every returned project calling `fetchProjectTimeSummary(p.id)`, and only clears `loading` in the `finally` once all of them have resolved. The list therefore cannot render until the slowest per-project request completes, and the number of requests grows linearly with the number of projects. `DashboardPage.tsx:161` and `EntriesPage.tsx:63` fan out `fetchEntries(p.id)` per project in the same way.

Observed: against a local dev server with three projects, the projects page held its "Loading projects…" state for roughly eleven seconds. Each round trip goes to Neon in `us-east-2`, so the per-request latency is what makes an N+1 expensive here.

**Correction to an earlier draft of this audit.** An earlier note claimed the app issues *duplicated* requests — `/api/projects` four times and `/api/tags` twice in a single page load. That claim does not survive checking. `main.tsx` wraps the app in `<React.StrictMode>`, and React double-invokes effects in development only. The doubling is StrictMode behaving as designed and does not occur in a production build. The N+1 fan-out and the blocking loading state above are real in both; the duplication is not a defect and should not be reported as one.

**Why it was not previously recorded:** the backlog was built from static inspection, and an N+1 is only visible once the number of projects and the database round-trip latency are both considered.

## 7. BUG-015 — No delete-project endpoint

**Severity:** Low. **Component:** `apps/backend/src/routes/project.routes.ts`.

The router defines `POST /projects`, `GET /projects`, `GET /projects/:id`, `GET /projects/:id/time-summary`, `PUT /projects/:id` and `PATCH /projects/:id/status` (:14-19). There is no delete route, and `deleteProject` does not exist anywhere in the backend or the frontend. Verified live: `DELETE /api/projects/:id` returns 404.

This is defensible against the specification, which asks only that projects be "created, described, and archived once they are finished", and the archive flow works correctly. It is recorded because the interface offers no way to remove a project created by mistake, and because the walkthrough's own test project could not be cleaned up afterwards — it had to be archived instead.

**Why it was not previously recorded:** a missing route leaves nothing to scan for, and archiving covers the specification's stated requirement, so nothing in the documentation points at the gap.

## 8. Manual walkthrough

A project named `AUDIT TEST 2026-09` was created with all nine field types, exercised, and archived at the end.

| Area | Verdict | Notes |
|---|---|---|
| Login, session, protected routes | Works | |
| Dashboard render | Works | Greeting, three stat cards, deadlines panel, activity chart, current projects, tags, recent entries |
| Project create with tags, edit, archive, unarchive | Works | |
| Entries still addable to an archived project | Works | Confirmed by API — archiving is a filter, not a lock, as intended |
| Entry format: eight of nine types | Works | TEXT, NUMBER, DATE, BOOLEAN, TAGS, CHECKLIST, LINK, REFERENCE all created and round-tripped correctly |
| COMPUTED at project-creation time | Broken | See below |
| COMPUTED added to an existing project | Works | The edit modal exposes "Formula ID" next to each numeric field, and the formula evaluates |
| Computed backfill onto existing entries | Works | An entry with Hours = 3 picked up Double hours = 6 when the computed field was added afterwards |
| Format versions immutable | Works | The entry stayed pinned to format version 8 after two later format changes |
| Entry create, tags, due date, backdating | Works | Values stored and rendered correctly, including checklist items and the reference |
| Statistics — time per project, group-by, plot over time | Works, except BUG-012 | |
| Dark mode | Partly broken | See §9 |
| Search, saved filters, calendar, board, open work | Present, not individually exercised | Code verified; runtime pass deferred |
| Offline queue, export/import | Present, not exercised | Deferred |
| Session-expiry redirect | Verified by code and unit test only | Not exercised live, to avoid disturbing the signed-in session |

**COMPUTED at creation time.** The create-project modal offers "Computed number" as a field type and a formula box whose placeholder is `Formula, e.g. {numeric-field-id} * 2`. At that moment no field has an ID yet, so there is no valid formula a user could type. Submitting sends the other fields successfully and the computed one returns 400, leaving a project with eight of its nine fields. The type should not be offered until the project exists, or the modal should accept a field reference by name and resolve it server-side.

**Reference fields.** The REFERENCE picker lists other projects only. The specification asks for "links from one entry to another, references between projects" — entry-to-entry references are not implemented.

**Computed fields in the entry form** render as read-only text reading `Calculated automatically: {6256bbd2-…} * 2`. The user is shown a raw UUID where a field name belongs.

## 9. Theming

Dark mode is implemented in `index.css` as thirteen `[data-theme="dark"]` overrides covering `bg-white`, `bg-slate-50/100`, `border-slate-100/200`, the `text-slate-400` through `text-slate-900` range, one hover state and the form controls. Nothing else is themed.

Confirmed visually: with dark mode on, the statistics error panel renders as a near-white `bg-red-50` box with `text-red-600` text on the dark page. The same applies to every surface built from `bg-red-50` (eighteen uses), `border-red-200` (sixteen), `bg-blue-50` (twelve), `bg-emerald-50` (nine) and `bg-amber-50` (four) — error panels, deadline cards, stat tiles and tag chips all stay light.

The accent colour is split. `bg-blue-600` and its relatives appear about seventy times across `pages/` and `components/`, while `text-cyan-600`, `text-cyan-700` and `text-cyan-400` appear fourteen times, concentrated in the sidebar and the statistics page. The day/week/month toggle on the statistics page is visibly cyan while every other primary control is blue.

Extending the override set and consolidating on one accent are prerequisites for Phase B, not polish to be added afterwards.

## 10. Performance baseline

Measured from the committed build in `apps/frontend/dist/assets`, dated 2026-09-20 14:54 UTC:

| Asset | Bytes | Approx. |
|---|---|---|
| `index-C9NAvquY.js` | 533,540 | 521 KB (~150 KB gzipped) |
| `index-DVfC3cdS.css` | 45,134 | 44 KB |

Every later bundle measurement is compared against these two numbers. The runtime cost described in BUG-014 is the more pressing half of the client's complaint that the app is slow, and it is independent of bundle size.

Separately, `components/Sidebar.tsx` writes a `radial-gradient` into an inline style on every mouse move (:100-106) and renders five particle spans (:234-240), which `index.css` drives through five infinite keyframe animations plus a sixth on the avatar ring (:104-206). Six permanently running animations sit behind every page. `prefers-reduced-motion` appears nowhere in the frontend, so none of this can be turned off by a viewer who asks for less motion — a live failure against FEAT-006 before any Phase B motion is added.

## 11. The seven documented gaps, re-checked

**Gap 1 — `EntryForm` renders only four of nine field types. Confirmed, and wider than recorded.** `components/EntryForm.tsx` handles TEXT, NUMBER, DATE and BOOLEAN only. It also has no `entryDate` input and does not carry tags, so backdating and tagging exist solely inside the bespoke modal in `ProjectDetailPage`, which does render all nine.

**Gap 2 — no global quick entry. Confirmed.** `AppLayout.tsx` has no New Entry control and the sidebar offers none. A search of the whole frontend for `metaKey` or `ctrlKey` returns one match: the Ctrl+Enter submit inside `EntryForm`. There is no Ctrl/Cmd+N and no command palette.

**Gap 3 — decorative sidebar effects. Confirmed**, with the cost described in §10.

**Gap 4 — dashboard structure. Partly confirmed.** The page has the greeting, stat cards, deadlines, activity, current projects, tags and recent entries. It lacks a New Entry action, and `ProjectCard.tsx` makes no reference to fields, so there are no format summaries.

**Gap 5 — no field builder on Project Detail. Confirmed.** The page renders an "Entry Format" section listing fields read-only with a format-history link. None of `createEntryField`, `updateEntryField` or `deleteEntryField` is called from it; all three live in `ProjectsPage`'s edit modal.

**Gap 6 — due dates rely on colour. Largely refuted.** `EntryCard` renders a textual "Overdue" badge, and `DeadlineReminders` and `OpenWorkPage` pair labels with icons. The real defect is duplication: there is no shared `DueDateBadge`, so each surface derives and renders urgency independently.

**Gap 7 — statistics incomplete. Largely refuted.** The statistics page offers a project selector, a metric field with all five operations, group-by over any non-computed field, and a timeline with day/week/month buckets plotting entry counts or a numeric total. Two gaps remain. The timeline requires the project to have a user-defined DATE field, so a project without one cannot be plotted at all even though every entry carries `entryDate`. And the metric selector lists only NUMBER and COMPUTED fields, so although the backend accepts `count` over TEXT, TAGS and BOOLEAN, counting entries grouped by a text field is unreachable from the interface.

## 12. Issue backlog, re-verified

Statuses re-checked against the code on 2026-10-11, after the Sprint 2/3 work
closed most of them. Every fix carries the regression test named in
`apps/backend/TESTING.md` — the project's rule that a bug is not done until a
test would have caught it.

| ID | Recorded | Verified state |
|---|---|---|
| BUG-001 format-version race | Open | Still open. `utils/entryFormat.ts` reads the highest version and writes `version + 1` outside any transaction. |
| BUG-002 hardcoded JWT fallback | Open | Fixed since the audit. The constant is gone: production refuses to start without `JWT_SECRET`, and elsewhere a per-process random secret is generated (`utils/auth.ts`); `jwtSecret.test.ts` locks it in. |
| BUG-003 no rate limiting | Open | Fixed since the audit. `app.ts` mounts `authLimiter` from `middleware/rateLimit.middleware.ts`; `rateLimit.test.ts` locks it in. |
| BUG-004 TOTP secrets plaintext | Open | Fixed since the audit. Secrets are encrypted at rest with `TWO_FACTOR_ENCRYPTION_KEY` (`utils/twoFactorSecret.ts`); setup answers 503 while the key is unset. |
| BUG-005 no 2FA recovery codes | Open | Fixed since the audit. The recovery-code lifecycle is covered as HTTP behaviour by `twoFactorSecurity.test.ts`. |
| BUG-006 2FA steps not linked | Open | Fixed since the audit. Login hands off through a purpose-scoped `2fa-pending` token (`utils/auth.ts`). |
| BUG-007 CI Node version mismatch | Open | Fixed since the audit. Since `1cb9e15` (2026-09-21) the workflow reads `node-version-file: '.nvmrc'`, so CI runs the declared Node 22. |
| BUG-008 stale Prisma client | Fixed | Agreed; remaining risk is procedural. |
| BUG-009 dashboard New Entry button | Fixed | Agreed. The intended action is back: `AppLayout` mounts the quick-capture control in the layout header. |
| BUG-010 session-expiry redirect | Fixed | Agreed by code and unit test; the credential-401 exemption list is correct. |
| BUG-011 missing ownership checks | New | Fixed since the audit. `ownedProject`/`ownedEntry` scope every entry and statistics query by `userId`; `entryOwnership.test.ts` locks it in. |
| BUG-012 blank numeric breaks statistics | New | Fixed since the audit. Blank values are filtered before the `::numeric` cast (`stats.controller.ts`); `blankNumericValues.test.ts` locks it in. |
| BUG-013 duplicate React keys in the field editor | New | Fixed since the audit. New rows use `new-${crypto.randomUUID()}` instead of `Date.now()` (`ProjectsPage.tsx`). |
| BUG-014 N+1 fan-out on list views | New | Fixed since the audit. The dashboard and entries pages fetch through the batched `fetchAllEntries` endpoint instead of one request per project. |
| BUG-015 no delete-project endpoint | New | Fixed since the audit. `DELETE /projects/:id` exists and cascades; `projectDelete.test.ts` locks it in. |

Of the feature requests (statuses re-checked 2026-10-11): FEAT-001 (Google Calendar) has since been delivered and checked live — the OAuth hand-off and the due-date mirror work end to end, and the one remaining wrinkle, the OAuth redirect falling back to localhost, is a missing `APP_URL` on Render, not missing code. FEAT-009 (My Grades) was built from Round 2 feedback after this audit. FEAT-007 was delivered through the BUG-003 fix, to its own acceptance criteria. FEAT-002 and FEAT-003 are partly addressed — the Round 1 rows in [User Feedback](user-feedback.md) record what remains — FEAT-004 has paging on the entry listing, and FEAT-006 has a reduced-motion guard and a skip link. FEAT-005 and FEAT-008 remain open.

## 13. Repository hygiene

Both findings were true at the audit date and both have since been resolved (re-checked 2026-10-11): the tracked files now check out clean on Linux and in CI without `core.autocrlf`, and `prisma/migrations/` now leads with a baseline (`0_init`) and carries the full history, so a fresh environment brought up with `prisma migrate deploy` — as CI's per-run database and the Render deploy's startup step both do — arrives at the current schema. The MkDocs build output in `site/` remains committed to the repository.

## 14. Recommended sequence

Phase C should lead with BUG-011 and BUG-012, then BUG-002 and BUG-003. BUG-011 and BUG-012 both need no misconfiguration to trigger — one is exploitable by any signed-in account, the other by any user who leaves a number blank — while BUG-002 requires a deployment mistake. The remainder of the recorded order stands.

Phase B should treat four items as prerequisites rather than polish: extending the dark-mode override set before any new coloured surface is introduced, adding a `prefers-reduced-motion` guard before any motion is added, removing the six always-on sidebar animations, and fixing the N+1 in BUG-014. Together these are the cheapest honest answer to the client's complaint about speed, and none of them depends on any of the 3D work.

## 15. Not yet covered

Search and saved filters, the calendar and board views, open work, the offline queue and sync, JSON and CSV export and import, and the live session-expiry redirect were verified by reading their code but not exercised in the browser. The live deployment was not probed. These are the remaining items for a second walkthrough.
