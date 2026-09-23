# FEAT-007: Rate Limiting on Auth Endpoints

**Priority:** High
**Status:** Duplicate (tracked in BUG-003)
**Component:** Backend — `apps/backend/src/app.ts`
**Labels:** feature, security

## Feature Description
Implement rate limiting on authentication endpoints to prevent brute-force attacks. This is the fix for BUG-003.

## User Story
As a system administrator, I want the API to throttle excessive requests so that attackers cannot brute-force passwords or spam registrations.

## Acceptance Criteria
- [x] `POST /api/auth/login` is limited to 20 attempts per 15 minutes per IP
- [x] `POST /api/auth/login/2fa` is limited to 10 attempts per 15 minutes per IP
- [x] `POST /api/auth/register` is limited to 5 attempts per hour per IP
- [x] Rate-limited responses return HTTP 429 with a `Retry-After` header
- [x] Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) are included on all auth responses
- [x] Rate limit configuration is via environment variables

## Current Behaviour
No rate limiting exists. Any client can send unlimited requests.

## Proposed Solution
Use `express-rate-limit` with a sliding window:
```typescript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
```

## Related
- BUG-003: No rate limiting on auth endpoints
- `apps/backend/AUTHENTICATION.md` — documented as a known limitation

## Resolution
Closed as a duplicate of BUG-003, which tracks the same rate-limiting work
against the same endpoints. The acceptance criteria above were delivered under
BUG-003 and are ticked accordingly.
