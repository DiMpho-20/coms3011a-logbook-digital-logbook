# FEAT-001: Google Calendar API Integration

**Priority:** Medium
**Status:** Done
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

## Status Notes (2026-09-20) — superseded, see Resolution below
Partial — do not close. The OAuth2 plumbing exists: `/api/google-calendar`
exposes `connect` (OAuth2 consent for the `calendar.events` scope),
`callback`, `status` and `disconnect` routes, backed by the
`GoogleCalendarConnection` model in `schema.prisma`. Separately,
OpenWorkPage offers a per-entry "Add to Google Calendar" link built
client-side, which is a workable manual path.

However, `POST /api/google-calendar/sync` is a stub: it lists the connected
calendars and returns a count, but never creates, updates or deletes events.
No code path pushes entry due dates to Google on entry create/update/delete,
so the core acceptance criteria remain unmet.

## Related
- `docs/project/client-interactions.md` — listed as "Planned for a later phase"
- `apps/frontend/src/pages/CalendarPage.tsx` — already has the UI for viewing due dates

## Resolution

Completed in PR #93 (merge `de08724`, on top of `aa9d469` and `cd4bf6e`),
which supersedes the 2026-09-20 note above: the stub `/sync` was replaced by
a real, idempotent mirror.

`syncDueDates` (`apps/backend/src/services/googleCalendarService.ts`) lists
the user's open, dated entries and reconciles them against the connected
primary calendar. Events the logbook created carry private extended
properties (`logbookSource=digital-logbook`, `logbookEntryId`), so a sync
finds its own events again without storing Google event ids: insert when an
entry has no event, patch when the summary or date changed, delete when the
entry was completed, undated or deleted (orphans are cleaned up too). Due
dates are calendar days, so events are all-day.

The OAuth hand-off is bound to the user who started it: the callback's
`state` is a 10-minute purpose-scoped JWT (`oauth-state`), so a callback URL
cannot be forged to attach someone else's calendar. Access/refresh tokens are
encrypted at rest with AES-256-GCM under `GOOGLE_TOKEN_ENCRYPTION_KEY`
(`apps/backend/src/utils/googleTokens.ts`) — the same envelope shape later
reused for TOTP secrets. The frontend exposes the operation through the
`GoogleCalendarSync` component on the Calendar page.

One deliberate deviation from the proposed solution: sync is an explicit,
idempotent operation the user triggers (`POST /api/google-calendar/sync`)
rather than a hook fired inside entry create/update/delete. That keeps
Google API latency and failures out of the entry-save transaction, and makes
the operation retryable and self-healing — re-running converges the calendar
to the logbook's state. All five acceptance criteria are met by the mirror.

Regression coverage is in `apps/backend/src/__tests__/googleCalendarSync.test.ts`
(create/update/remove/idempotency) and `googleCalendar.test.ts` (connect,
callback incl. forged-state rejection, status, disconnect).
