# FEAT-001: Google Calendar API Integration

**Priority:** Medium
**Status:** Planned (post-Sprint 2)
**Component:** Frontend + Backend
**Labels:** feature, integration, external-api

## Feature Description
Integrate Google Calendar API so that logbook entry due dates automatically sync to the user's Google Calendar. The existing `due_date` field on entries already provides the required data — the integration needs OAuth2 setup and a Calendar API client.

## User Story
As a student, I want my logbook entry deadlines to appear on my Google Calendar so that I get timely reminders alongside my other commitments.

## Acceptance Criteria
- [ ] User can connect their Google account via OAuth2
- [ ] Entry due dates are pushed to the connected Google Calendar
- [ ] Updating an entry's due date updates the calendar event
- [ ] Deleting an entry removes the calendar event
- [ ] User can disconnect their Google account

## Current Behaviour
Entries have a `due_date` field but no external calendar sync. Users must manually check the app for upcoming deadlines.

## Proposed Solution
1. Add Google OAuth2 consent screen for `calendar.events` scope
2. Store the user's Google access/refresh tokens in the database
3. On entry create/update/delete, call the Google Calendar API to sync
4. Use the `googleapis` npm package for the API client

## Technical Requirements
- Google Cloud Console project with Calendar API enabled
- OAuth2 client ID and secret as environment variables
- Token refresh logic for long-lived sessions

## Alternatives Considered
- **iCal export** (.ics file download) — simpler but not real-time
- **CalDAV** — more universal but more complex to implement

## Related
- `docs/client-interactions.md` — listed as "Planned for a later phase"
- `apps/frontend/src/pages/CalendarPage.tsx` — already has the UI for viewing due dates
