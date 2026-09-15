# FEAT-003: View Discoverability — Nav Hints and Guided Tour

**Priority:** Medium
**Status:** Open (filed from Sprint 2 user feedback)
**Component:** Frontend — `apps/frontend/src/components/Sidebar.tsx`, `apps/frontend/src/components/AppLayout.tsx`
**Labels:** feature, ux, user-feedback

## Feature Description
Improve discoverability of secondary views (Calendar, Board, Open Work, Stats). One tester found calendar and board views hard to locate. Add visual hints, a guided tour for first-time users, or a "Views" dropdown in the sidebar.

## User Story
As a user, I want to easily discover all available views (calendar, kanban board, stats) so that I can use the view that best suits my workflow.

## Acceptance Criteria
- [ ] Sidebar groups related views under collapsible sections (e.g. "Views")
- [ ] First-time users see a brief tooltip or popover highlighting available views
- [ ] Each view has a descriptive icon in the sidebar nav
- [ ] A "What's available" help button shows a list of all views with descriptions

## Current Behaviour
All views are listed in a flat sidebar list. Calendar, Board, and Open Work are separate nav items with no grouping or explanation. Users who don't explore the sidebar may never discover these views.

## Proposed Solution
1. Group views under a "Views" collapsible section in the sidebar
2. Add icons to each view (calendar icon, kanban icon, chart icon)
3. Show a one-time tooltip on first login highlighting "More views available here"
4. Consider adding view-switcher tabs within the project detail page

## Evidence
- SUS Round 1: Tester R2 reported difficulty finding calendar/board views
- `docs/user-feedback.md` integration table: "View discoverability" filed for Sprint 3

## Related
- `apps/frontend/src/components/Sidebar.tsx` — primary nav component
- `apps/frontend/src/pages/CalendarPage.tsx` — one of the hard-to-find views
- `apps/frontend/src/pages/BoardPage.tsx` — another hard-to-find view
