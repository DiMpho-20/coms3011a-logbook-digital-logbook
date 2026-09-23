# BUG-002: Hardcoded JWT Secret Fallback

**Severity:** Critical (Security)
**Status:** Fixed
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

## Resolution
Fixed, and deliberately not by the patch sketched above, which kept the
hardcoded constant as a development fallback. The constant is gone entirely.

In production a missing `JWT_SECRET` now throws at module load and the server
refuses to start. Outside production it starts with a secret generated for that
process, and warns that sessions will not survive a restart.

The generated secret matters as much as the throw. `NODE_ENV` is not guaranteed
to be `production` on every deployment, so the guard cannot be the only defence.
With a per-process random secret, a deployment that both forgets `JWT_SECRET`
and forgets `NODE_ENV` loses its sessions on restart rather than signing them
with a key anyone can read in this repository — a bad outcome instead of a
dangerous one.

The secret is still read once at module load rather than per call, so tokens
signed earlier in a process stay verifiable for its lifetime.

`.env.example` now documents the variable as required in production and gives a
command to generate one. No value was added to any real `.env`.

Regression coverage is in `apps/backend/src/__tests__/jwtSecret.test.ts`,
including an assertion that a token issued without `JWT_SECRET` does not verify
against the removed constant.
