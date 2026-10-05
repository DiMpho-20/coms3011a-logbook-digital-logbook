# Google Calendar Sync

## 1. Overview

A student can connect their own Google account from the **Calendar** page and
copy the due dates of their open logbook entries into their **primary Google
Calendar** as all-day events. Syncing again brings the calendar up to date:
changed dates are moved, and finished or deleted entries are removed.

## 2. Problem / Motivation

Due dates in the logbook are only useful if the student sees them. Most
students already live in Google Calendar for lectures and tests, so a deadline
that exists only inside the app is easy to miss. The feature was tracked as
`FEAT-001` with the story: *"As a student, I want my logbook entry deadlines
to appear on my Google Calendar so that I get timely reminders alongside my
other commitments."*

## 3. What It Does

On the **Calendar** page, a Google Calendar panel offers:

- **Connect Google Calendar**: sends the student to Google to grant access,
  then back to the Calendar page with a "connected" message.
- **Sync now**: creates, updates or removes calendar events, then reports the
  result, e.g. "Synced: 2 added, 1 updated, 1 removed."
- **Disconnect**: removes the connection. Events already added stay in the
  student's calendar.

Each event is an all-day event on the due date, titled
`<Project name> — <entry's first text value>`, with a link back to the project
in its description. Only **open** entries that **have a due date** are synced.

A sync with nothing to change reports "Everything is already up to date."
If the server has not been configured for Google, the **Connect** button is
disabled and the panel explains that sync is not set up on the server yet.

## 4. How It Works

```mermaid
sequenceDiagram
    participant S as Student
    participant F as GoogleCalendarSync.tsx
    participant B as Backend /api/google-calendar
    participant G as Google (OAuth + Calendar API)
    S->>F: Connect
    F->>B: GET /connect (JWT)
    B-->>F: Google consent URL with signed state
    F->>G: browser goes to Google's consent screen
    G->>B: GET /callback?code&state
    B->>B: verify state → user; exchange code for tokens;<br/>encrypt and store tokens
    B-->>S: redirect to /calendar?calendar=connected
    S->>F: Sync now
    F->>B: POST /sync (JWT)
    B->>G: list our events; insert / patch / delete
    B-->>F: { created, updated, removed }
```

**Connecting (OAuth 2.0 authorization-code flow).**

1. `GET /api/google-calendar/connect` (signed in) builds Google's consent URL
   with:
   - the `calendar.events` scope only;
   - `access_type: "offline"` and `prompt: "consent"`, so Google issues a
     refresh token;
   - a `state` value.
2. The `state` is a short-lived (10-minute) JWT naming the student, with
   `purpose: "oauth-state"`. Google's redirect back to `/callback` is a plain
   browser navigation without our login token, so the state is the only thing
   tying the returned code to the right account. A forged or expired state is
   rejected, and a state token can't be used as a login token (or the other
   way round).
3. `/callback` exchanges the code for tokens, encrypts them and stores them in
   the `GoogleCalendarConnection` row for that student, then redirects to
   `/calendar?calendar=connected` (or `denied` / `error`).

**Syncing.** `POST /api/google-calendar/sync`:

1. decrypts the stored tokens. If they can't be decrypted, for example because
   the encryption key changed, the connection is deleted and the student is
   asked to connect again (`409`);
2. lets the Google client refresh an expired access token, and saves the new
   one, encrypted;
3. runs `syncDueDates`.

## 5. Technical Implementation

| Layer | File | Responsibility |
|---|---|---|
| UI | `apps/frontend/src/components/GoogleCalendarSync.tsx` (shown on `CalendarPage.tsx`) | Status, connect, sync, disconnect, result messages |
| Routes | `apps/backend/src/routes/googleCalendarRoutes.ts` | `GET /connect`, `GET /callback`, `GET /status`, `POST /sync`, `DELETE /disconnect` under `/api/google-calendar` |
| Sync logic | `apps/backend/src/services/googleCalendarService.ts` | OAuth client per request, `syncDueDates` |
| Token encryption | `apps/backend/src/utils/googleTokens.ts` | AES-256-GCM encrypt/decrypt |
| OAuth state | `apps/backend/src/utils/auth.ts` (`generateOAuthState`, `verifyOAuthState`) | Signed, purpose-scoped, 10-minute state |
| Database | `GoogleCalendarConnection` model in `apps/backend/prisma/schema.prisma` | One row per student: encrypted access and refresh tokens, expiry |
| Library | [`googleapis`](https://github.com/googleapis/google-api-nodejs-client) (see `docs/third-party.md`) | OAuth code exchange, token refresh, Calendar API. Only the Calendar module is imported; the package root's type definitions for every Google API made the backend build run out of memory |
| Tests | `apps/backend/src/__tests__/googleCalendar.test.ts`, `googleCalendarSync.test.ts` | State, encryption, callback, sync; Google is mocked |

**The sync algorithm** (`syncDueDates`) is idempotent and stores **no Google
event ids**:

1. Every event the logbook creates carries *private extended properties*
   `logbookSource=digital-logbook` and `logbookEntryId=<entry id>`. These are
   visible only to this OAuth client.
2. On sync, it lists only events with `logbookSource=digital-logbook`
   (following pagination) and indexes them by entry id.
3. For each open, dated entry it either inserts a new event, patches an event
   whose title, description or date changed, or leaves an unchanged one alone.
4. Any logbook event left over belongs to an entry that was finished,
   undated or deleted, or is a duplicate; it is deleted. "Already gone" (404,
   410) counts as success.
5. It returns `{ created, updated, removed }`.

Because the events identify themselves, re-running sync never duplicates
events, and nothing in our database has to be kept in step with Google.

**Security points.**

- Tokens are encrypted at rest with AES-256-GCM, a fresh IV each time and an
  authentication tag, so tampering is detected. The key is derived from the
  `GOOGLE_TOKEN_ENCRYPTION_KEY` environment variable.
- A new OAuth client is created per request, so one student's credentials can
  never leak into another's request.
- The narrow `calendar.events` scope is requested, not full calendar access.
- Disconnecting also tries to revoke the grant at Google, so the app
  disappears from the student's Google third-party access list. The local
  removal happens even if revocation fails.

**Configuration** (names only; values are environment secrets):
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`GOOGLE_TOKEN_ENCRYPTION_KEY`, and `APP_URL` for the redirect back to the
Calendar page.

## 6. User Workflow / Demonstration

1. Create an entry with a due date in any project.
2. Open **Calendar** and press **Connect Google Calendar**.
3. Choose a Google account and allow access to calendar events; you return to
   the Calendar page with "Google Calendar connected".
4. Press **Sync now**: "Synced: 1 added". Open Google Calendar to see an
   all-day event on the due date, titled with the project and entry.
5. Change the entry's due date and press **Sync now**: "1 updated", and the
   event moves.
6. Mark the entry done and sync again: "1 removed".
7. Press **Disconnect**: the connection is removed; existing events stay.

## 7. Screenshots

Add these files under `docs/extra-features/images/google-calendar-sync/`, then
remove the comment markers around each image.

| File | Should show |
|---|---|
| `calendar-panel.png` | The Calendar page with the Google Calendar panel (not connected) |
| `consent.png` | Google's consent screen for the calendar.events scope |
| `synced.png` | The panel after a sync, with its result message |
| `google-event.png` | The resulting all-day event in Google Calendar |

<!-- ![Google Calendar panel](images/google-calendar-sync/calendar-panel.png) -->
<!-- ![Google consent screen](images/google-calendar-sync/consent.png) -->
<!-- ![After syncing](images/google-calendar-sync/synced.png) -->
<!-- ![Event in Google Calendar](images/google-calendar-sync/google-event.png) -->

## 8. Limitations

- **Sync is manual.** Events change only when the student presses
  **Sync now**. `FEAT-001` proposed syncing automatically on every entry
  change; that is not how it was built.
- **One-way.** Changes made in Google Calendar are not brought back into the
  logbook.
- **Primary calendar only,** and only entry due dates. Assessment dates from
  My Grades are not synced.
- **Events stay after disconnecting.** The student removes them in Google
  Calendar themselves.
- **Requires server configuration** (Google Cloud OAuth client and the
  variables above). Without it, Connect is disabled.
- **Who can connect** also depends on how the OAuth consent screen is set up
  in Google Cloud. For example, an app still in Google's "testing" mode only
  allows listed test users. That setting is outside the repository.
- **Rotating the encryption key** makes stored tokens unreadable; affected
  students are asked to connect again.

## 9. Future Improvements

- Sync automatically when an entry's due date changes or the entry is
  completed.
- Include My Grades assessment dates (tests and due dates).
- Let the student choose a calendar, or create a dedicated "Digital Logbook"
  calendar.
- Offer to remove the logbook's events when disconnecting.

## 10. Contributors

From the commit history:

- **WendyAmahle**: implemented the integration (`aa9d469`, "add Google
  Calendar integration") and the OAuth binding and sync fixes (`cd4bf6e`).
- **Alon-Algorithm**: fixed the backend build by importing only the Calendar
  module from `googleapis` (`f81386c`).

The team should confirm this list.
