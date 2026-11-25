# BUG-012: A Blank Numeric Field Breaks Every Aggregation and Leaks the Database Error

**Severity:** High
**Status:** Fixed
**Component:** Frontend — `apps/frontend/src/lib/utils.ts`; Backend — `apps/backend/src/utils/entryValues.ts`, `apps/backend/src/controllers/stats.controller.ts`
**Labels:** bug, data-integrity, statistics

## Bug Description
When a user saves an entry without filling in a NUMBER field, an empty string is stored for that field. Every later aggregation over that field then fails with a Postgres cast error, and the raw database error is rendered to the user on the statistics page.

The chain, each step individually defensible:

1. `defaultValuesForFields` (`frontend/src/lib/utils.ts:74-86`) seeds untouched fields; its `else` branch at :83 assigns `""`, so an untouched NUMBER field is submitted as an empty string
2. `checkValueShape` (`backend/src/utils/entryValues.ts:18`) returns `null` for any empty value before reaching the NUMBER branch, so `""` passes validation with no type check
3. `createEntry` (`backend/src/controllers/entry.controller.ts:158-161`) writes it through `String(value ?? "")`, storing an `EntryValue` row whose `value` is `""`
4. `groupStats` (`backend/src/controllers/stats.controller.ts:40`) casts `(mv.value)::numeric` with no guard, and `timelineStats` (:134) does the same for `SUM`. Postgres raises `22P02` and the endpoint returns 500
5. `flattenValues` (`backend/src/controllers/entry.controller.ts:23`) renders the stored `""` as `Number(ev.value) || 0`, so the entry list displays a clean "Hours: 0" and nothing looks wrong

## Steps to Reproduce
1. Create a project with a NUMBER field
2. Add an entry and leave that field untouched; save
3. Open Statistics, select the project and that field, and choose sum, avg, min or max
4. The panel shows: `Invalid prisma.$queryRawUnsafe() invocation: Raw query failed. Code: 22P02. Message: invalid input syntax for type numeric: ""`

## Expected Behaviour
A field the user never filled in should not produce a stored value at all, and an aggregation should ignore entries that have no value for the field. No internal database error should ever reach the interface.

## Actual Behaviour
Sum, average, min and max on that field all return HTTP 500 until the row is corrected, and the raw Prisma error is displayed to the user.

## Environment
- **Files:** `apps/frontend/src/lib/utils.ts:83`, `apps/backend/src/utils/entryValues.ts:18`, `apps/backend/src/controllers/entry.controller.ts:23,158-161`, `apps/backend/src/controllers/stats.controller.ts:40,134`, `apps/frontend/src/pages/StatsPage.tsx:145,170`
- **Verified:** reproduced live with one entry at Hours = 3 and one at `""`; `avg`, `min` and `sum` all returned 500

## Proposed Fix
Preferred — stop storing empty values. In `createEntry` and `updateEntry`, drop entries whose value is empty before the `values.create` mapping, so a field the user skipped simply has no row.

Defensive, in addition — guard the cast so one bad row cannot break a whole aggregation:

```sql
WHERE mv.value ~ '^-?[0-9]+(\.[0-9]+)?$'
```

Separately, stop passing `error.message` to the client from the stats catch blocks; log it and return a generic message. `StatsPage.tsx:145` and `:170` render whatever the server sends.

Note when fixing: `utils/entryFormat.ts:53-69` explains at length why `backfillNewField` deliberately refuses to fabricate a `0` for pre-existing entries, because it "would silently drag the average down and force the min to 0". The entry form does exactly that for new entries. Both halves should end up agreeing.

## Related
- Not covered by `entryValidation.test.ts`, which tests rejection of a *non-numeric* value but never creates an entry that simply leaves a NUMBER field alone and then aggregates
- Recorded in `docs/project/audits/feature-audit-2026-09.md` §4

## Resolution
Fixed in two halves, because fixing only the write path would have left the
rows already in the database breaking statistics forever.

**Write path.** `createEntry` filters empty values out before the `values.create`
mapping and `updateEntry` deletes the row instead of upserting `""`, so a field
the user left alone now has no row at all. The required-field check still runs
against the full value map beforehand, so a required field cannot be emptied
this way. This also settles the disagreement with `backfillNewField`, which
already refused to fabricate a value for a field an entry never recorded.

**Read path.** `groupStats` and `timelineStats` exclude rows that cannot survive
their cast: `NUMERIC_VALUES` for anything reaching `::numeric`, `DATE_VALUES`
for the timeline's `::date`, and `NON_EMPTY_VALUES` for `count`, which does not
cast but should not report a field as filled in when it holds an empty string.
All three are fixed literals, never built from request input.

Verified against the live database on the project that first produced the bug:
sum, avg, min, max, count and the timeline all returned 200 where every one of
them previously returned 500, and `avg` reports 3 rather than being dragged to
1.5 by the empty row.

Regression coverage is in `apps/backend/src/__tests__/blankNumericValues.test.ts`.

Not addressed here: `flattenValues` still renders a stored `""` as `0`, which is
what disguised this bug in the entry list. New entries no longer produce such
rows, but any written before this fix will keep displaying as `0` until they are
cleaned up.
