# BUG-014: List Views Fan Out One Request Per Project and Block on All of Them

**Severity:** Medium (Performance)
**Status:** Fixed
**Component:** Frontend — `apps/frontend/src/pages/ProjectsPage.tsx`, `DashboardPage.tsx`, `EntriesPage.tsx`
**Labels:** bug, performance, frontend

## Bug Description
`loadProjects` (`ProjectsPage.tsx:63-93`) sets `loading` true, awaits `fetchProjects()`, then awaits a `Promise.all` over every returned project calling `fetchProjectTimeSummary(p.id)`, and only clears `loading` in the `finally` once all of them have resolved. Nothing renders until the slowest per-project request completes, and the request count grows linearly with the number of projects.

`DashboardPage.tsx:161` and `EntriesPage.tsx:63` fan out `fetchEntries(p.id)` per project in the same shape.

Because every round trip goes to Neon in `us-east-2`, per-request latency is what makes the N+1 expensive.

## Steps to Reproduce
1. Sign in with several projects on the account
2. Navigate to Projects
3. The page holds "Loading projects…" until every project's time summary has returned

Observed during the audit: roughly eleven seconds for three projects against a local dev server.

## Expected Behaviour
The project list renders as soon as `GET /api/projects` returns, with each card's time summary filling in independently — or the totals come back on the projects payload itself.

## Actual Behaviour
The whole list is gated on the slowest of N secondary requests.

## Environment
- **Files:** `apps/frontend/src/pages/ProjectsPage.tsx:63-93`, `DashboardPage.tsx:161`, `EntriesPage.tsx:63`

## Proposed Fix
Either render first and let summaries arrive after:

```typescript
const data = await fetchProjects();
setProjects(data);
setLoading(false);            // render now
void Promise.all(data.map(...)).then(setSummaries);   // fill in after
```

or, better, include `totalMinutes`/`entryCount` in the `GET /api/projects` response so one request serves the page. The latter changes the API contract, so it needs agreement first.

## Not a defect — recorded to prevent re-reporting
An earlier draft of the audit claimed the app issues *duplicated* requests (`/api/projects` four times, `/api/tags` twice per page load). That claim does not hold. `main.tsx` wraps the app in `<React.StrictMode>`, which double-invokes effects **in development only**. The doubling is React behaving as designed and does not occur in a production build. Only the N+1 fan-out and the blocking loading state above are real defects.

## Related
- Client feedback, 2026-09-18: "the app is slow"
- Recorded in `docs/feature-audit-2026-09.md` §6

## Resolution
Fixed in two steps. First, progressive rendering (commits `624e1de`,
`b11c254`): the Projects, Dashboard and Entries pages now render as soon as
the project list returns, with per-project summaries and entries filling in
independently, so the slowest secondary request no longer gates the page.

Second, the fan-out was removed (commits `1f1261e`, `4a6b473`): a new
user-scoped `GET /api/entries` endpoint returns the caller's entries in one
request with format snapshots deduplicated on the wire, and Dashboard and
Entries now load from it instead of issuing two requests per project. Field
definitions are fetched only for projects whose entries lack a format
snapshot. The endpoint caps at 500 rows, and both pages disclose a
truncated response rather than presenting a partial total as a complete one.

Verified by the frontend build, lint, the 65-test frontend suite, and a live
check that the endpoint is mounted and returns 401 to unauthenticated calls.
Weekly figures now count backdated entries in the week they visibly sit in;
see the body of `4a6b473`.

