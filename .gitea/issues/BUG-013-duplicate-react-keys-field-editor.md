# BUG-013: Duplicate React Keys in the Project Field Editor

**Severity:** Medium
**Status:** Open
**Component:** Frontend — `apps/frontend/src/pages/ProjectsPage.tsx`
**Labels:** bug, frontend, react

## Bug Description
Each new entry-field row in the create/edit project modal is given ``id: `new-${Date.now()}` `` (`ProjectsPage.tsx:139`), and the rows are rendered with `key={field.id}` (:383). Two "+ Add Field" clicks that land within the same millisecond therefore produce two rows sharing a key, and React's reconciliation for duplicate keys is undefined — rows may be duplicated or omitted.

The same ids double as identity for removal: `:148` tests `id.startsWith("new-")` to decide whether a removed row needs a `DELETE` call, so a collision affects deletion as well as rendering.

## Steps to Reproduce
1. Open Projects and click "New Project"
2. Click "+ Add Field" rapidly several times
3. The number of rows does not match the number of clicks, and the console logs `Encountered two children with the same key, new-<timestamp>`

Observed during the audit: nine clicks produced fifteen rows.

## Expected Behaviour
Each row has a stable unique key regardless of how fast rows are added, and the row count matches the click count.

## Actual Behaviour
Rows sharing a millisecond share a key; React duplicates or drops rows and logs a key-collision error.

## Environment
- **File:** `apps/frontend/src/pages/ProjectsPage.tsx` (lines 139, 148, 383)
- **Affects:** Create-project and edit-project modals — the only place entry fields can be defined

## Proposed Fix
Use an identifier that cannot collide:

```typescript
{ id: `new-${crypto.randomUUID()}`, name: "", type: "TEXT", required: false, isNew: true }
```

`crypto.randomUUID()` keeps the `new-` prefix that `:148` relies on, so the removal logic is unchanged. A monotonic counter in a `useRef` would work equally well.

## Related
- No frontend test covers the field editor, which is why the suite passes despite the collision
- Recorded in `docs/feature-audit-2026-09.md` §5
