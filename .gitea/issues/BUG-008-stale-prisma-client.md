# BUG-008: Stale Prisma Client Breaks Test Suite

**Severity:** Medium
**Status:** Fixed (commit `24e9162`)
**Component:** Backend — `apps/backend/vitest.config.ts`, `apps/backend/prisma/schema.prisma`
**Labels:** bug, testing, prisma

## Bug Description
After any Prisma schema change, the generated Prisma client becomes stale. Running the test suite against a stale client produces "Unknown argument" errors across the entire suite because Prisma's type definitions no longer match the actual database schema.

## Steps to Reproduce
1. Modify `schema.prisma` (e.g. add a new field)
2. Run `npm test --workspace=apps/backend` without running `npx prisma generate` first
3. All tests fail with "Unknown argument" errors

## Expected Behaviour
The Prisma client should be regenerated automatically before tests run, or at minimum as part of `postinstall`.

## Actual Behaviour
Developers must manually run `npx prisma generate --schema=apps/backend/prisma/schema.prisma` after every schema change. Forgetting this step causes the entire test suite to fail with misleading errors.

## Resolution
The fix applied in commit `24e9162` was to regenerate the Prisma client before running tests. For CI, the `deploy.yaml` workflow already includes a `npx prisma generate` step before the test run.

## Environment
- **File:** `apps/backend/prisma/schema.prisma`
- **File:** `.gitea/workflows/deploy.yaml` (line 23)

## Proposed Permanent Fix
Add `prisma generate` to the `postinstall` script in `apps/backend/package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

## Related
- Discovered during test development for Sprint 2
- Documented in `apps/backend/TESTING.md` under "Bugs Found During Testing"
