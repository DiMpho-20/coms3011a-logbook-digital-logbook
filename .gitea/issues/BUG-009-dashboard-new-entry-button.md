# BUG-009: Dashboard "New Entry" Button Did Not Open Entry Creation

**Severity:** Medium
**Status:** Fixed (commit `8b9e11d`)
**Component:** Frontend — `apps/frontend/src/pages/DashboardPage.tsx`
**Labels:** bug, frontend, dashboard, fixed

## Bug Description
The "New Entry" button on the Dashboard page only navigated to `/entries` (the entries list page) instead of opening the entry creation form. Users had to navigate to a project first and then create an entry, adding an unnecessary step.

## Steps to Reproduce
1. Login and navigate to the Dashboard
2. Click the "New Entry" button
3. You are taken to the entries list page, not the entry creation form

## Expected Behaviour
The button should navigate to the first active project's detail page where the entry form is available, or to `/projects` if no projects exist.

## Actual Behaviour
Navigated to `/entries` — a page that lists entries but doesn't directly offer creation.

## Resolution
Fixed in commit `8b9e11d`: the button now finds the first active project and navigates to its detail page (`/projects/:id`). If no projects exist, it navigates to `/projects` so the user can create one first.

## Environment
- **File:** `apps/frontend/src/pages/DashboardPage.tsx`
- **Browser:** All browsers

## Related
- Covered by `apps/frontend/src/pages/__tests__/DashboardPage.test.tsx` (6 tests)
