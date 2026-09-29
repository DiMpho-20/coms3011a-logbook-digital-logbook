# FEAT-009: Year-to-Date / Grade Tracking

**Priority:** Low
**Status:** Open (filed from Sprint 3 user feedback)
**Component:** Frontend — Statistics page / Dashboard
**Labels:** feature, user-feedback

## Feature Description
A Round 2 SUS tester asked for a "year-to-date calculator or tracking of grades": a view that aggregates logged work across the academic year so a student can see cumulative progress, rather than only per-project and per-period figures. An optional follow-on is capturing a mark per project and tracking it alongside logged time.

## User Story
As a student, I want a year-to-date view of my logged work (and, optionally, my grades per project) so that I can measure cumulative progress against my academic goals.

## Acceptance Criteria
- [ ] A year-to-date summary of entries and time logged (e.g. totals since the start of the academic year)
- [ ] A selectable date range for the summary, so an academic year can be defined explicitly
- [ ] (Optional) A mark/grade captured per project and shown next to logged time
- [ ] Reachable from the Statistics page or as a configurable dashboard panel

## Current Behaviour
Statistics are grouped per project, per period (group and timeline views) and for custom expressions. There is no cumulative "year to date" roll-up and no grade tracking.

## Evidence
- SUS Round 2 (28 September 2026): the one substantive "one small change" suggestion was "Year to date calculator or tracking of grades"
- `docs/user-feedback.md` integration table (Round 2 row)
- `docs/user-feedback-round2.csv` raw responses

## Related
- `apps/frontend/src/pages/StatsPage.tsx` — statistics aggregation UI
- `apps/backend/src/controllers/stats.controller.ts` — existing statistics endpoints
