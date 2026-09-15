# BUG-002: Hardcoded JWT Secret Fallback

**Severity:** Critical (Security)
**Status:** Open
**Component:** Backend — `apps/backend/src/utils/auth.ts`
**Labels:** bug, security, authentication

## Bug Description
The `JWT_SECRET` environment variable falls back to `"your-fallback-secret-key"` if not set. This is acceptable for local development but **unsafe for production**. If the environment variable is accidentally omitted in a production deployment, all JWTs would be signed with a known, guessable secret — allowing any attacker to forge valid tokens.

## Steps to Reproduce
1. Deploy the backend without setting `JWT_SECRET` in the environment
2. Register or login a user
3. Decode the JWT — the signing key will be `"your-fallback-secret-key"`

## Expected Behaviour
The server should refuse to start (or at minimum log a warning) if `JWT_SECRET` is not set in production.

## Actual Behaviour
The server starts silently with a hardcoded, publicly known secret.

## Environment
- **File:** `apps/backend/src/utils/auth.ts` (line 4)
- **Affects:** All JWT-signed tokens (login, 2FA, password reset)

## Proposed Fix
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
export const jwtSecret = JWT_SECRET || 'your-fallback-secret-key'; // dev only
```

## Related
- Documented in `apps/backend/AUTHENTICATION.md` as a known limitation
- The Render deployment should have `JWT_SECRET` set — verify in Render dashboard
