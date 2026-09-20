# BUG-011: No Ownership Checks on the Entry and Statistics APIs

**Severity:** High (Security — broken access control)
**Status:** Open
**Component:** Backend — `apps/backend/src/controllers/entry.controller.ts`, `apps/backend/src/controllers/stats.controller.ts`
**Labels:** bug, security, api

## Bug Description
Every handler in the entry API resolves records by ID alone, without checking that the record belongs to the caller. `requireAuth` establishes that the caller holds a valid JWT; it does not establish that the caller owns the resource named in the path. The result is that any authenticated account can read, modify, delete and aggregate another account's entries given an ID.

Affected handlers:

| Handler | Line | Problem |
|---|---|---|
| `getEntries` | entry.controller.ts:74 | `where: { projectId }` with no `userId` term |
| `updateEntryStatus` | :96 | No ownership check |
| `createEntry` | :126 | `findUnique({ where: { id: projectId } })` alone |
| `updateEntry` | :177 | Reads `project.userId`, uses it only for tag resolution, never compares to `req.userId` |
| `deleteEntry` | :263 | No ownership check |
| `groupStats` | stats.controller.ts:6 | Typed `req: Request` — cannot read `req.userId` |
| `timelineStats` | stats.controller.ts:91 | Typed `req: Request` — cannot read `req.userId` |

## Steps to Reproduce
1. Sign in as user A and open any project — the project ID is visible in the address bar at `/projects/:id`
2. Sign in as user B in another browser
3. As user B, call `GET /api/projects/<A's project id>/entries` with B's own valid token
4. A's entries are returned. `DELETE /api/entries/<id>` and `PUT /api/entries/<id>` behave the same way

## Expected Behaviour
Every handler scopes its query by the authenticated user, returning 404 when the record belongs to someone else — the pattern already used correctly throughout `project.controller.ts` and `entryField.controller.ts`.

## Actual Behaviour
Records are resolved by ID alone. Ownership is never consulted.

## Environment
- **Files:** `apps/backend/src/controllers/entry.controller.ts`, `apps/backend/src/controllers/stats.controller.ts`
- **Affects:** All entry read/write endpoints and both statistics endpoints

## Proposed Fix
Type all seven handlers as `AuthenticatedRequest` and add an ownership guard, mirroring `ownedProject()` in `entryField.controller.ts`:

```typescript
const project = await prisma.project.findFirst({
  where: { id: projectId, userId: req.userId! },
});
if (!project) return res.status(404).json({ error: "Project not found" });
```

For entry-scoped handlers, join through the project:

```typescript
const entry = await prisma.logbookEntry.findFirst({
  where: { id, project: { userId: req.userId! } },
});
```

Add a regression test per handler asserting that a second user receives 404.

## Related
- Not detected by the original backlog scan: an absent check leaves no pattern to grep for and no comment to read
- Recorded in `docs/feature-audit-2026-09.md` §3
