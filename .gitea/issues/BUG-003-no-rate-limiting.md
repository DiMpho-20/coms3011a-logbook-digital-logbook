# BUG-003: No Rate Limiting on Auth Endpoints

**Severity:** High (Security)
**Status:** Fixed
**Component:** Backend — `apps/backend/src/app.ts`, `apps/backend/src/routes/auth.routes.ts`
**Labels:** bug, security, authentication

## Bug Description
There is no rate limiting on any API endpoints, including authentication endpoints. This makes the application vulnerable to:
- **Brute-force password attacks** on `POST /api/auth/login`
- **TOTP code guessing** on `POST /api/auth/login/2fa` (6-digit codes = 1M possibilities)
- **Registration spam** on `POST /api/auth/register`
- **Password reset abuse** on `POST /api/auth/forgot-password`

## Steps to Reproduce
1. Send 1000 login attempts with different passwords to `POST /api/auth/login`
2. All attempts are processed without throttling or lockout

## Expected Behaviour
After N failed attempts within a time window, the server should respond with HTTP 429 (Too Many Requests) and temporarily block the IP or account.

## Actual Behaviour
All requests are processed without any throttling.

## Environment
- **Affected endpoints:** All `/api/auth/*` routes
- **Documented in:** `apps/backend/AUTHENTICATION.md` (known limitations section)

## Proposed Fix
Install and configure `express-rate-limit`:
```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: { error: 'Too many attempts, please try again later' },
});

app.use('/api/auth', authLimiter);
```

## Related
- `apps/backend/AUTHENTICATION.md` — explicitly documented as a known limitation
- Especially critical combined with BUG-005 (no 2FA recovery codes) and BUG-006 (sequential 2FA steps)

## Resolution
Fixed with `express-rate-limit`, to FEAT-007's acceptance criteria.

A generous limiter (100 per 15 minutes) is mounted on the whole `/api/auth`
router so rate-limit headers appear on every auth response, with tighter limits
on the three routes worth attacking: login at 20 per 15 minutes, `login/2fa` at
10 per 15 minutes because a six-digit code is only a million guesses, and
register at 5 per hour. Every window and limit is an environment variable,
documented in `.env.example`.

Both header families are sent. FEAT-007 asks for `X-RateLimit-Limit` and
`X-RateLimit-Remaining` — the legacy names — while its own code sample sets
`legacyHeaders: false`, which suppresses exactly those. Enabling both satisfies
the criteria without pinning clients to the older form. `Retry-After` comes from
the library on a 429.

`app.set("trust proxy", …)` was necessary rather than incidental: Render
terminates TLS at its own proxy, so without it `req.ip` is the proxy's address
and every visitor in the world shares one bucket. It defaults to 1 hop in
production and 0 elsewhere, since locally a forwarded header would only be a way
to spoof an address.

Limits are off under `NODE_ENV=test`, because `auth.test.ts` registers and signs
in far more often than any of these windows allow and would otherwise fail for
reasons unrelated to what it tests. An explicit `RATE_LIMIT_DISABLED` overrides
that either way, which is how the regression suite switches limiting back on.

Verified against the running backend: an auth response carries
`x-ratelimit-limit: 100`, `x-ratelimit-remaining: 99` and the standard
`ratelimit-*` family. Regression coverage is in
`apps/backend/src/__tests__/rateLimit.test.ts`.
