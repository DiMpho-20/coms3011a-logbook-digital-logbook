# BUG-003: No Rate Limiting on Auth Endpoints

**Severity:** High (Security)
**Status:** Open
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
