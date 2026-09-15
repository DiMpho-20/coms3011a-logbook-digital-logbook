# FEAT-004: API Pagination for List Endpoints

**Priority:** Medium
**Status:** Open
**Component:** Backend — all controllers
**Labels:** feature, performance, api

## Feature Description
Add pagination support to all list endpoints (`GET /projects`, `GET /projects/:id/entries`, `GET /stats/*`). Currently, all list endpoints return the complete dataset, which will cause performance issues as users accumulate hundreds or thousands of entries.

## User Story
As a user with many entries, I want the API to return results in pages so that the app loads quickly even with large datasets.

## Acceptance Criteria
- [ ] `GET /projects` supports `?page=1&limit=20` query parameters
- [ ] `GET /projects/:id/entries` supports pagination
- [ ] Response includes `{ data: [...], pagination: { page, limit, total, totalPages } }`
- [ ] Default limit is 20 items per page
- [ ] Maximum limit is 100 items per page
- [ ] Frontend list views use pagination (infinite scroll or page buttons)

## Current Behaviour
All list endpoints return every record. For a user with 500 entries, this means a single API call returns all 500 records plus their nested data.

## Proposed Solution
1. Add a shared `paginate()` utility that accepts `{ page, limit }` and returns Prisma `skip`/`take` options
2. Apply to all `findMany` calls in controllers
3. Return pagination metadata alongside the data
4. Frontend: add cursor-based infinite scroll or page number buttons

## Alternatives Considered
- **Cursor-based pagination** — better for real-time data but more complex to implement
- **Offset pagination** — simpler, sufficient for logbook use case

## Related
- `apps/backend/src/controllers/entry.controller.ts`
- `apps/backend/src/controllers/project.controller.ts`
- `apps/backend/src/controllers/stats.controller.ts`
