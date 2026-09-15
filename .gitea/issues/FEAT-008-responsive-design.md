# FEAT-008: Responsive Design Testing and Mobile Optimisation

**Priority:** Low
**Status:** Open
**Component:** Frontend — all pages
**Labels:** feature, testing, responsive

## Feature Description
Add formal responsive design testing and optimise the UI for mobile devices. The README mentions responsive design support, but no formal testing has been documented and some views may not render correctly on small screens.

## User Story
As a student on the go, I want to use the logbook on my phone so that I can log entries from anywhere.

## Acceptance Criteria
- [ ] All pages render correctly at 320px, 768px, and 1440px widths
- [ ] Sidebar collapses to a hamburger menu on mobile
- [ ] Tables and forms are scrollable/stacked on small screens
- [ ] Touch targets are at least 44×44px
- [ ] Font sizes are readable without zooming
- [ ] Responsive tests are added to the test suite (or visual regression tests)

## Current Behaviour
The app uses Tailwind CSS responsive utilities but no formal testing has been done. The sidebar navigation may overlap content on small screens.

## Proposed Solution
1. Audit all pages at mobile breakpoints
2. Add a responsive sidebar toggle (hamburger menu)
3. Add viewport meta tag verification
4. Add Cypress or Playwright viewport-switching tests

## Related
- `apps/frontend/src/components/Sidebar.tsx` — primary responsive concern
- `apps/frontend/src/components/AppLayout.tsx` — layout wrapper
- `docs/client-interactions.md` — responsive design was discussed
