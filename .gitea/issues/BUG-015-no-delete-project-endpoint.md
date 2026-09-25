# BUG-015: No Delete-Project Endpoint

**Severity:** Low
**Status:** Resolved
**Component:** Backend — `apps/backend/src/routes/project.routes.ts`
**Labels:** bug, api, ux

## Bug Description
The project router defines `POST /projects`, `GET /projects`, `GET /projects/:id`, `GET /projects/:id/time-summary`, `PUT /projects/:id` and `PATCH /projects/:id/status` (lines 14-19). There is no delete route, and `deleteProject` does not exist anywhere in the backend or the frontend. A project created by mistake can only be archived, never removed.

## Steps to Reproduce
1. Create a project
2. Look for a delete action in the Projects list — only Edit and Archive are offered
3. Call `DELETE /api/projects/:id` directly — it returns 404

## Expected Behaviour
Either a delete endpoint with a confirmation step in the interface, or an explicit product decision that projects are archive-only, documented so the absence is deliberate rather than accidental.

## Actual Behaviour
No route exists; the interface offers no way to remove a project.

## Environment
- **File:** `apps/backend/src/routes/project.routes.ts` (no delete route defined)
- **Verified:** `DELETE /api/projects/:id` returns 404 against the running backend

## Proposed Fix
This is defensible against the specification, which asks only that projects be "created, described, and archived once they are finished", so the first decision is whether to implement it at all.

If implemented, cascade behaviour needs care — `Project` cascades to `EntryField`, `LogbookEntry`, `EntryValue`, `EntryFormatVersion` and `ProjectTag`, so a delete destroys the record the logbook exists to keep. A confirmation naming the entry count, or a soft delete, would be safer than a hard `DELETE`.

## Related
- Surfaced during the audit walkthrough: the test project `AUDIT TEST 2026-09` could not be cleaned up and had to be archived
- Recorded in `docs/feature-audit-2026-09.md` §7

## Resolution
Implemented as a hard delete, as the tutor asked for projects to be removable completely rather than only archived. `DELETE /api/projects/:id` removes the project and cascades to its fields, entries, values, version history and tag links. The interface guards it: the confirmation names how many entries will be lost, offers **Archive instead**, and needs the project's name typed before **Delete permanently** is enabled. Available from the project card (trash icon) and the project page's menu. Covered by `apps/backend/src/__tests__/projectDelete.test.ts`.
