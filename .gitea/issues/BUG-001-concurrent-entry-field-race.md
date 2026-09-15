# BUG-001: Concurrent Entry-Field Creation Race Condition

**Severity:** High
**Status:** Open
**Component:** Backend — `apps/backend/src/controllers/entryField.controller.ts`
**Labels:** bug, race-condition, backend

## Bug Description
When two entry fields are created concurrently for the same project, the `createFormatVersion` function reads the latest format version and inserts `version + 1` without transactional protection. Both requests read the same version number and attempt to insert the same next version, causing a unique constraint violation on `(project_id, version)`.

## Steps to Reproduce
1. Create a project
2. Send two `POST /api/projects/:projectId/entry-fields` requests simultaneously (e.g. via Promise.all in a test)
3. One succeeds, the other fails with HTTP 400

## Expected Behaviour
Both field creations should succeed regardless of timing.

## Actual Behaviour
The second request fails with a 400 error because the unique `(project_id, version)` constraint rejects the duplicate version number.

## Root Cause
`createFormatVersion()` in `apps/backend/src/utils/entryFormat.ts` performs a read-then-write:
1. `SELECT MAX(version) FROM entry_format_version WHERE project_id = ?`
2. `INSERT INTO entry_format_version (project_id, version, ...) VALUES (?, max+1, ...)`

These two operations are not wrapped in a transaction, so concurrent calls see the same `max` value.

## Environment
- **Backend:** Express 5 + Prisma 7 + Neon PostgreSQL
- **Affected endpoint:** `POST /api/projects/:projectId/entry-fields`
- **Introduced in:** Sprint 2 (migration `20260908000000_entry_format_versions`)

## Fix Candidates
1. Wrap version bump in a `SERIALIZABLE` transaction with automatic retry
2. Use `SELECT MAX(version) + 1 FOR UPDATE` inside a transaction
3. Use an advisory lock on the project_id before version bump

## Workaround
Create entry fields sequentially (as the current UI does). This only affects concurrent API calls or parallel test setup.

## Related
- `apps/backend/TESTING.md` — documented under "Bugs Found During Testing"
- `apps/backend/src/__tests__/api.test.ts` — tests create fields sequentially to avoid this
