# BUG-010: Session Token Expiry Did Not Redirect to Login

**Severity:** Medium
**Status:** Fixed (commit `ed17a53`)
**Component:** Frontend — `apps/frontend/src/api/client.ts`, `apps/frontend/src/components/ProtectedRoute.tsx`
**Labels:** bug, frontend, authentication, fixed

## Bug Description
When a user's JWT session token expired, the app showed a generic error instead of redirecting to the login page. Users were stuck on the current page with no clear indication that they needed to log in again.

## Steps to Reproduce
1. Login and use the app
2. Wait for the JWT to expire (or manually delete it from localStorage)
3. Navigate to a protected page (e.g. /projects)
4. See a generic error instead of being redirected to login

## Expected Behaviour
On receiving a 401 response from the API, the app should clear the session and redirect to `/login?expired=1` with a message explaining the session expired.

## Actual Behaviour
The request failed silently or showed a generic network error.

## Resolution
Fixed in commit `ed17a53`:
- Added an axios response interceptor that catches 401 responses
- Clears localStorage auth data
- Redirects to `/login?expired=1`
- `ProtectedRoute` component checks for token existence before rendering

## Environment
- **File:** `apps/frontend/src/api/client.ts` (axios interceptor)
- **File:** `apps/frontend/src/components/ProtectedRoute.tsx`
- **Browser:** All browsers

## Related
- Covered by `apps/frontend/src/components/__tests__/ProtectedRoute.test.tsx` (3 tests)
- Known limitation: `ProtectedRoute` only checks token existence, not validity — expired tokens pass the gate and rely on the 401 interceptor to catch them after the first failed request
