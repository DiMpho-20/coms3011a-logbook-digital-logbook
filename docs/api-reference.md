# API Reference

This page documents every endpoint exposed by the Digital Logbook backend
API. All endpoints are prefixed with `/api` and return JSON responses.

**Base URL (production):**
`https://digital-logbook-backend-latest.onrender.com/api`

**Authentication:** Most endpoints require a JWT in the
`Authorization: Bearer <token>` header. Obtain one via the
[`POST /api/auth/login`](#post-apiauthlogin) endpoint.

---

## Health & Diagnostics

### `GET /api/health`

Returns service health status. No authentication required.

**Response `200`:**
```json
{ "status": "ok" }
```

### `GET /api/db-check`

Verifies database connectivity. No authentication required.

**Response `200`:**
```json
{ "status": "ok", "message": "Database connected" }
```

---

## Authentication (`/api/auth`)

### `POST /api/auth/register`

Create a new user account.

| Field | Type | Required | Notes |
|---|---|---|---|
| `fullName` | string | Yes | |
| `email` | string | Yes | Must be a valid email; unique |
| `password` | string | Yes | Min 8 chars, at least one uppercase letter and one digit |

**Response `201`:**
```json
{ "message": "User registered successfully. Email auto-verified (dev mode).", "user": { "id": "...", "fullName": "...", "email": "..." } }
```
**Errors:** `409` (duplicate email), `400` (validation failure)

---

### `POST /api/auth/verify-email`

Verify a user's email address with the token sent during registration.

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes |

**Response `200`:** `{ "message": "Email verified successfully." }`
**Errors:** `400` (invalid or expired token)

---

### `POST /api/auth/login`

Authenticate and receive a JWT. If 2FA is enabled, returns a flag
instead of a token.

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |
| `password` | string | Yes |

**Response `200` (no 2FA):**
```json
{ "message": "Login successful", "token": "eyJ...", "user": { "id": "...", "fullName": "...", "email": "..." }, "scheduledDeletionAt": null }
```
`scheduledDeletionAt` is an ISO date when the account is inside its 30-day
deletion grace period (see [`DELETE /api/auth/account`](#delete-apiauthaccount)),
otherwise `null`. Logging in during the grace period does not cancel the
deletion. Once the date has passed, the account is erased at the next login
attempt, which then fails with `401` like an unknown email.

**Response `200` (2FA enabled):**
```json
{ "requiresTwoFactor": true, "email": "..." }
```
**Errors:** `401` (wrong password or unknown email — identical message), `403` (unverified account)

---

### `POST /api/auth/login/2fa`

Complete 2FA login after `POST /api/auth/login` returned `requiresTwoFactor`.

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |
| `token` | string | Yes — 6-digit TOTP code |

**Response `200`:**
```json
{ "token": "eyJ...", "user": { "id": "...", "email": "..." }, "scheduledDeletionAt": null }
```
**Errors:** `401` (invalid code), `400` (malformed code)

---

### `POST /api/auth/forgot-password`

Request a password-reset email. Returns the same message regardless of
whether the email exists (prevents account enumeration).

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |

**Response `200`:**
```json
{ "message": "If account exists, a reset link has been sent." }
```

---

### `POST /api/auth/reset-password`

Reset the password using a single-use token from the reset email.

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes |
| `newPassword` | string | Yes — same rules as registration |

**Response `200`:** `{ "message": "Password reset successfully." }`
**Errors:** `400` (invalid or expired token)

---

### `DELETE /api/auth/account` 🔒

Schedule the authenticated user's account for deletion. Nothing is removed
straight away: the account enters a 30-day grace period, ending at midnight
30 days from the request, and a confirmation email is sent. The user can
still log in during that time and can cancel with
[`POST /api/auth/account/cancel-deletion`](#post-apiauthaccountcancel-deletion).
Once the period has ended, the account and all its data (projects, entries,
values, tokens) are permanently deleted by the purge job, which runs when the
server starts and then hourly, or at the next login attempt if that comes first.

Calling this again while a deletion is already scheduled keeps the original
date and does not send another email.

| Field | Type | Required |
|---|---|---|
| `confirmPassword` | string | Yes |

**Response `200`:**
```json
{ "message": "Your account will be permanently deleted on Sat Oct 24 2026.", "scheduledDeletionAt": "2026-10-24T00:00:00.000Z" }
```
**Errors:** `400` (missing `confirmPassword`), `401` (wrong password), `404` (user not found)

---

### `POST /api/auth/account/cancel-deletion` 🔒

Cancel a scheduled account deletion during the grace period. No request body.

**Response `200`:** `{ "message": "Account deletion cancelled." }`
**Errors:** `400` (no deletion is scheduled), `404` (user not found)

---

### `POST /api/auth/2fa/setup` 🔒

Begin 2FA setup — returns a TOTP secret and QR code data URL.

**Response `200`:**
```json
{ "secret": "JBSWY3DPEHPK3PXP", "qrCode": "data:image/png;base64,..." }
```
**Errors:** `400` (2FA already enabled)

---

### `POST /api/auth/2fa/verify-setup` 🔒

Verify the TOTP code from the authenticator app to complete 2FA setup.

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes — 6-digit TOTP code |

**Response `200`:** `{ "message": "2FA enabled." }`
**Errors:** `400` (incorrect code)

---

### `POST /api/auth/2fa/disable` 🔒

Disable 2FA. Requires password re-authentication.

| Field | Type | Required |
|---|---|---|
| `password` | string | Yes |

**Response `200`:** `{ "message": "2FA disabled." }`
**Errors:** `401` (wrong password)

---

### `GET /api/auth/2fa/status` 🔒

Check whether 2FA is enabled for the authenticated user.

**Response `200`:**
```json
{ "isTwoFactorEnabled": true }
```

---

## Projects (`/api/projects`) 🔒

### `POST /api/projects`

Create a new project.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | Unique per user |
| `description` | string | No | |

**Response `201`:**
```json
{ "id": "...", "name": "...", "description": "...", "status": "ACTIVE" }
```
**Errors:** `409` (duplicate name), `400` (missing name)

---

### `GET /api/projects`

List all projects for the authenticated user.

**Response `200`:** Array of project objects.

---

### `GET /api/projects/:id`

Get a single project with its entry fields.

**Response `200`:**
```json
{ "id": "...", "name": "...", "status": "ACTIVE", "entryFields": [...] }
```
**Errors:** `404` (not found)

---

### `PUT /api/projects/:id`

Update a project's name or description.

| Field | Type | Required |
|---|---|---|
| `name` | string | No |
| `description` | string | No |

**Response `200`:** Updated project object.
**Errors:** `409` (duplicate name), `404` (not found)

---

### `PATCH /api/projects/:id/status`

Toggle a project between `ACTIVE` and `ARCHIVED`.

| Field | Type | Required |
|---|---|---|
| `status` | string | Yes — `"ACTIVE"` or `"ARCHIVED"` |

**Response `200`:** Updated project object.
**Errors:** `400` (invalid status), `404` (not found)

---

### `DELETE /api/projects/:id`

Permanently delete a project together with its entry fields, entries, their values and version history, and its tag links. Unlike archiving (`PATCH /api/projects/:id/status`), this can't be undone — the interface asks for the project's name to be typed first.

**Response `200`:** `{ "message": "Project deleted", "deletedEntries": 12 }`
**Errors:** `404` (not found, or not the caller's)

---

### `GET /api/projects/:id/time-summary`

Get aggregated time statistics for a project.

**Response `200`:**
```json
{ "totalMinutes": 180, "totalHours": 3, "entryCount": 5, "lastEntryAt": "2026-09-14T..." }
```

---

## Entry Fields (`/api/...`) 🔒

### `POST /api/projects/:projectId/entry-fields`

Create a custom entry field for a project.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `type` | string | Yes | `TEXT`, `NUMBER`, `DATE`, `BOOLEAN`, `TAGS`, `CHECKLIST`, `LINK`, `REFERENCE`, `COMPUTED` |
| `required` | boolean | No | Default `false`. Always stored as `false` for `COMPUTED`, which fills itself in |
| `formula` | string | `COMPUTED` only | Required for `COMPUTED`, rejected for every other type. See [Computed formulas](#computed-formulas) |

Creating a `COMPUTED` field also fills in its value on the project's existing
entries, and every change to a project's fields saves a new format version.

**Response `201`:** Created entry field object.
**Errors:** `400` (missing name, unknown type, missing or invalid formula), `404` (project not found)

#### Computed formulas

A formula is arithmetic over other fields of the same project, referenced by
id in braces:

```text
{hours-field-id} * {rate-field-id}
({pay-field-id} + 50) * 1.15
```

- Only numbers, `+ - * /`, parentheses and `{field-id}` references are allowed.
- A reference must be a `NUMBER` or another `COMPUTED` field in the project.
  Computed fields are always recalculated in dependency order, never read
  from a previously stored value.
- A field may not use itself, directly or through a loop of computed fields.
- A referenced value that an entry left empty counts as `0`. A result that is
  not a finite number (for example, dividing by zero) rejects the entry.
- The web app lets people write `{Field name}` and converts names to ids
  before calling the API. The API itself only accepts ids.

---

### `GET /api/projects/:projectId/entry-fields`

List the project's current entry fields, oldest first. Archived (deleted)
fields are left out; they remain in the format version snapshots.

**Response `200`:** Array of entry field objects.
**Errors:** `404` (project not found)

---

### `GET /api/projects/:projectId/entry-format-versions`

List all format version snapshots for a project.

**Response `200`:** Array of format version objects.

---

### `PUT /api/entry-fields/:id`

Update an entry field. All body fields are optional.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Cannot be blank |
| `type` | string | Only while no entry has a value for the field |
| `required` | boolean | Always `false` for `COMPUTED` |
| `formula` | string | `COMPUTED` only; same rules as [Computed formulas](#computed-formulas) |

When the formula changes, or a field becomes `COMPUTED`, the stored result is
recalculated on every existing entry in the project. So is every computed
field that uses this one, directly or indirectly. This happens in the same
transaction as the field update, so entries and statistics never mix old and
new results. An entry the new formula cannot be worked out for (for example,
a division by zero) is left without a value. Renaming a field does not touch
stored results.

**Response `200`:** Updated entry field object.
**Errors:** `400` (blank name, unknown type, invalid formula or loop, formula on a non-computed field), `404` (field not found), `409` (type change on a field that already has values)

---

### `DELETE /api/entry-fields/:id`

Soft-delete (archive) an entry field. Existing entries retain their
values; the field is hidden from new entry forms.

**Response `204`:** No content.
**Errors:** `404` (field not found)

---

## Entries (`/api/...`) 🔒

### `GET /api/entries`

List entries across every project belonging to the authenticated user, so a
page showing several projects needs one request rather than one per project.

Scoped to the caller: entries are reached by joining through the owning
project, so an id belonging to another account returns nothing rather than
that account's data.

| Query param | Type | Default | Notes |
|---|---|---|---|
| `projectId` | string | — | Restrict to one project. A project the caller does not own yields an empty list, not a 404 |
| `projectStatus` | string | `ALL` | `ACTIVE`, `ARCHIVED` or `ALL` |
| `from` | string | — | ISO date or datetime, inclusive lower bound |
| `to` | string | — | ISO date or datetime, inclusive upper bound |
| `limit` | number | `200` | Capped at `500` |

`from` and `to` filter on `COALESCE(entryDate, createdAt)` — the date the
interface shows. An entry backdated to March counts as March, not as the day
it was typed, which is what the timeline and calendar already display.

Results are ordered newest first by that same date, with the entry id as a
tiebreaker so the order is stable between identical dates.

**Response `200`:**

```json
{
  "entries": [
    {
      "id": "…",
      "projectId": "…",
      "durationMinutes": 45,
      "entryDate": null,
      "dueDate": null,
      "values": { "<fieldId>": "…" },
      "status": "OPEN",
      "completedAt": null,
      "tags": ["coursework"],
      "formatVersionId": "…",
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "formats": {
    "<formatVersionId>": { "version": 3, "fields": [ … ] }
  },
  "limit": 200,
  "truncated": false
}
```

Unlike `GET /api/projects/:projectId/entries`, an entry does not carry its
own `format`. Each entry names its `formatVersionId` and the snapshots are
returned once in the shared `formats` map — a term of entries on a nine-field
project would otherwise be mostly repeated schema. An entry predating format
versioning has `formatVersionId: null`.

`truncated` is `true` when exactly `limit` rows were returned, meaning there
may be more. A cursor can be added to this object later without breaking
callers.

**Errors:** `400` for an unknown `projectStatus`, a non-positive `limit`, or
an unparseable `from`/`to`. `401` when the token is missing or invalid.

---

### `POST /api/projects/:projectId/entries`

Create a new logbook entry.

| Field | Type | Required | Notes |
|---|---|---|---|
| `durationMinutes` | number | Yes | |
| `values` | object | Yes | Key = field ID, value = field value |
| `entryDate` | string | No | ISO date (YYYY-MM-DD) |
| `recurrence` | object | No | Creates a recurrence rule: `{ "pattern": "DAILY" | "WEEKLY" | "MONTHLY", "until"?: ISO date }` |
| `dueDate` | string | No | ISO date (YYYY-MM-DD) |

**Response `201`:** Created entry object with `status: "OPEN"`.

When an entry includes `recurrence`, the original and each generated
occurrence expose a `recurrence` object containing its rule id, pattern,
enabled state and next occurrence. Due occurrences are generated automatically
while the backend is running and are also caught up when the student's entries
are read.

### `PATCH /api/recurrences/:id`

Enable or disable future automatic occurrences for a recurring-entry rule.
The rule must belong to the authenticated user.

| Body field | Type | Required | Description |
| --- | --- | --- | --- |
| `enabled` | boolean | Yes | `false` stops future entries; existing entries remain unchanged. |

**Response `200`:** Updated recurrence summary.

---

### `GET /api/projects/:projectId/entries`

List entries for a project. Supports filtering.

| Query param | Type | Notes |
|---|---|---|
| `status` | string | Filter by `OPEN` or `DONE` |
| `dueBefore` | string | ISO date — returns entries due before this date |
| `archived` | string | `exclude` (default) leaves archived entries out, `only` returns just the archive, `include` returns both. Also accepted by `GET /api/entries`. |

**Response `200`:** Array of entry objects. Each has `archivedAt` (`null` while active).

---

### `PUT /api/entries/:id`

Update an entry's duration, values, or dates.

| Field | Type | Required |
|---|---|---|
| `durationMinutes` | number | No |
| `values` | object | No |
| `entryDate` | string | No |
| `dueDate` | string | No |

**Response `200`:** Updated entry object.

---

### `PATCH /api/entries/:id/status`

Update an entry's status (mark as done or reopen).

| Field | Type | Required |
|---|---|---|
| `status` | string | Yes — `"OPEN"` or `"DONE"` |

**Response `200`:**
```json
{ "id": "...", "status": "DONE", "completedAt": "2026-09-14T..." }
```
**Errors:** `400` (invalid status), `404` (not found)

---

### `DELETE /api/entries/:id`

Permanently delete an entry and all its values.

**Response `200`:** `{ "message": "Entry deleted." }`
**Errors:** `404` (not found)

---

## Entry History & Archive (`/api/...`) 🔒

Every create, edit, status change and restore of an entry saves a new **version** — a snapshot of the entry's content at that moment. Versions are never changed or deleted, so an edit can't overwrite what the entry said before. Entries created before this feature existed show their current state as version 1 until their first change.

A version object:
```json
{
  "version": 2,
  "reason": "UPDATED",
  "restoredFromVersion": null,
  "createdAt": "2026-09-24T10:15:00.000Z",
  "snapshot": { "durationMinutes": 45, "entryDate": null, "dueDate": null, "values": { "<fieldId>": "..." }, "format": { "version": 1, "fields": [] }, "tags": [], "status": "OPEN", "completedAt": null }
}
```
`reason` is `CREATED`, `UPDATED` or `RESTORED`.

### `GET /api/entries/:id/versions`

The entry's full history, oldest first.

**Response `200`:** `{ "entryId": "...", "entryCreatedAt": "...", "currentVersion": 3, "versions": [ ...version objects ] }`
**Errors:** `404` (not found)

---

### `GET /api/entries/:id/versions/at?date=<ISO date>`

The entry as it stood at a moment in time: the newest version saved at or before `date`.

**Response `200`:**
- `{ "existed": true, "entryCreatedAt": "...", "version": { ... }, "isCurrent": false }`
- `{ "existed": false, "entryCreatedAt": "..." }` when `date` is before the entry was created

**Errors:** `400` (missing or invalid date), `404` (not found)

---

### `POST /api/entries/:id/versions/:version/restore`

Make an earlier version the current entry. The restore is saved as a new `RESTORED` version, so the version being replaced stays in the history. Values for fields since deleted from the project can't come back and are counted in `skippedFields`.

**Response `200`:** `{ "entry": { ...entry }, "version": { ...the new version }, "skippedFields": 0 }`
**Errors:** `400` (invalid version number), `404` (entry or version not found)

---

### `PATCH /api/entries/:id/archive`

Move one entry to the archive, or back to the active logbook.

| Field | Type | Required |
|---|---|---|
| `archived` | boolean | Yes |

**Response `200`:** Updated entry object.
**Errors:** `400`, `404` (not found)

---

### `POST /api/entries/archive`

Archive (or restore) several selected entries at once. Ids that aren't the caller's are skipped.

| Field | Type | Required |
|---|---|---|
| `ids` | string[] | Yes — 1 to 500 entry ids |
| `archived` | boolean | Yes |

**Response `200`:** `{ "updated": 2 }`
**Errors:** `400`

---

## Statistics (`/api/...`) 🔒

### `POST /api/projects/:projectId/stats/group`

Aggregate entry field values with grouping.

| Field | Type | Required | Notes |
|---|---|---|---|
| `metricFieldId` | string | Yes | ID of the field to aggregate |
| `operation` | string | Yes | `sum`, `avg`, or `count` |
| `groupByFieldId` | string | No | ID of the field to group by |

**Response `200`:**
```json
{ "results": [{ "group": "Category A", "value": 195 }] }
```
**Errors:** `400` (missing field, bad operation, type mismatch), `404` (unknown field)

---

### `POST /api/projects/:projectId/stats/timeline`

Aggregate entry counts over time buckets.

| Field | Type | Required | Notes |
|---|---|---|---|
| `dateFieldId` | string | Yes | ID of a DATE-type field |
| `bucket` | string | Yes | `day`, `week`, or `month` |

**Response `200`:**
```json
{ "points": [{ "date": "2026-09-01", "count": 5 }, { "date": "2026-09-02", "count": 3 }] }
```
**Errors:** `400` (invalid bucket, non-DATE field, missing field), `404` (unknown field)

---

### `POST /api/projects/:projectId/stats/expression`

Evaluate a custom expression (US16) across every entry in the project, and
return the single number it works out to.

| Field | Type | Required | Notes |
|---|---|---|---|
| `expression` | string | Yes | Up to 500 characters |

**Syntax.** `COUNT()` counts the entries in the project. `SUM(field)`,
`AVG(field)`, `MIN(field)` and `MAX(field)` aggregate one Number or Computed
field. These combine with `+`, `-`, `*`, `/` and parentheses, with the usual
precedence. A field is named directly (`SUM(hours)`), or in braces when the
name contains spaces (`SUM({Tasks Completed})`). Names are matched without
regard to capitals.

**Request:**
```json
{ "expression": "SUM({Hours}) / COUNT()" }
```

**Response `200`:**
```json
{ "value": 3.42 }
```

**Semantics.** Values that are not readable as a number are skipped, so
`AVG` averages the values it can read rather than dividing by the entry
count. A field no entry has filled in sums to `0`; averaging, minimising or
maximising it is an error rather than a misleading zero. Computed fields
aggregate like any other number, using the value already stored per entry —
the formula is not re-evaluated here.

**Errors:** `400` (empty or malformed expression, unknown function, unknown
or duplicated field name, non-numeric field, unbalanced parentheses,
division by zero), `401` (not signed in), `404` (project not found, which is
also what another owner's project returns)

Expressions are parsed and evaluated by the server; no user input is ever
executed, and field names reach the database only as bound parameters after
being matched against the project's own fields.

---

## Tags (`/api/tags`) 🔒

Each user has their own tag vocabulary, shared by their projects and entries.
Tags are created implicitly: sending a new tag name on a project or entry adds
it. These endpoints read and prune that vocabulary.

### `GET /api/tags`

List the authenticated user's tags, alphabetically.

**Response `200`:**
```json
[{ "id": "...", "name": "coursework" }, { "id": "...", "name": "urgent" }]
```

---

### `DELETE /api/tags/:id`

Delete a tag from the vocabulary. It is removed from every project and entry
it was on; the projects and entries themselves are not changed otherwise.

**Response `204`:** No content.
**Errors:** `404` (tag not found, or not the caller's)

---

## Reminders (`/api/reminders`) 🔒

US28. A reminder is either set by hand (`source: "MANUAL"`) or generated from
the user's reminder rules:

| Source | Generated when |
|---|---|
| `DUE_SOON` | An open, unarchived entry's due date is within `dueSoonDays` days |
| `OVERDUE` | An open, unarchived entry's due date has passed |
| `STALE` | An open, unarchived entry has not been edited for `staleDays` days |
| `DAILY_LOG` | Nothing has been logged today and it is past `dailyLogTime` |

Rules are evaluated whenever reminders are read (`GET /reminders` and
`GET /reminders/count`). Each condition produces at most one reminder, so a
completed or dismissed reminder stays that way while the condition holds. A
pending generated reminder whose condition lapses is marked `COMPLETED` if
its entry was marked done (or, for `DAILY_LOG`, something was logged), and
removed otherwise, e.g. when the due date moves or the rule is switched off.
Calendar days are counted in the rules' `timeZone`.

Reminder object:
```json
{
  "id": "...",
  "title": "Due soon: Submit lab report",
  "note": null,
  "source": "DUE_SOON",
  "status": "PENDING",
  "remindAt": "2026-09-26T10:00:00.000Z",
  "completedAt": null,
  "dismissedAt": null,
  "createdAt": "2026-09-26T10:00:00.000Z",
  "entry": {
    "id": "...", "projectId": "...", "projectName": "Chemistry",
    "label": "Submit lab report", "dueDate": "2026-09-27T00:00:00.000Z", "status": "OPEN"
  }
}
```

### `GET /api/reminders`

List the caller's reminders.

**Query:** `status` = `pending` (default) \| `completed` \| `dismissed` \| `done` (completed + dismissed) \| `all`;
`due=true` keeps only reminders whose `remindAt` has passed.
Pending reminders are ordered by `remindAt`; others most recently changed first. At most 200.

**Response `200`:** array of reminder objects.
**Errors:** `400` (unknown status)

---

### `GET /api/reminders/count`

**Response `200`:** `{ "due": 3 }`: pending reminders whose time has come.

---

### `POST /api/reminders`

Set a reminder by hand.

**Body:**
```json
{ "title": "Email supervisor", "remindAt": "2026-09-27T09:00:00.000Z", "note": "optional", "entryId": "optional uuid" }
```

**Response `201`:** the reminder.
**Errors:** `400` (missing title, invalid date), `404` (entry not found, or not the caller's)

---

### `PATCH /api/reminders/:id`

Complete, dismiss, reopen, snooze or edit a reminder. Send any of
`status` (`PENDING` \| `COMPLETED` \| `DISMISSED`), `title`, `note`, `remindAt`.
Setting a status stamps `completedAt`/`dismissedAt`; `PENDING` clears both.

**Response `200`:** the reminder.
**Errors:** `400` (invalid value, empty body), `404`

---

### `DELETE /api/reminders/:id`

Delete a manual reminder. Generated reminders would come back while their
condition holds, so they must be dismissed instead.

**Response `204`:** No content.
**Errors:** `400` (generated reminder), `404`

---

### `GET /api/reminders/settings`

The caller's reminder rules (defaults shown):
```json
{
  "dueSoonEnabled": true, "dueSoonDays": 1,
  "overdueEnabled": true,
  "staleEnabled": false, "staleDays": 7,
  "dailyLogEnabled": false, "dailyLogTime": "18:00",
  "timeZone": "UTC"
}
```

---

### `PUT /api/reminders/settings`

Update any subset of the rules. `dueSoonDays` 0–30, `staleDays` 1–365,
`dailyLogTime` `HH:MM`, `timeZone` an IANA zone name.

**Response `200`:** the full rules.
**Errors:** `400` (out-of-range or invalid value)

---

## Push notifications (`/api/push`) 🔒

Web push for reminders. When `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are
set, a job runs every minute. For each user with a subscribed device, it
applies their reminder rules and pushes every pending reminder whose
`remindAt` has passed and that hasn't been pushed yet. If more than three are
due at once, it sends one summary instead. Snoozing a reminder (a new
`remindAt`) lets it be pushed again. Without the keys, push is off and
reminders stay in-app only.

Push payload, as the service worker receives it:
```json
{ "title": "Due soon: Submit lab report", "body": "Chemistry: Submit lab report", "url": "/reminders", "tag": "reminder-<id>" }
```

### `GET /api/push/public-key`

**Response `200`:** `{ "publicKey": "B..." }`, or `{ "publicKey": null }` when push is off.

---

### `POST /api/push/subscriptions`

Register this device. The body is the browser's `PushSubscription.toJSON()`.
Reminders already due at this point count as pushed, so a new device isn't
sent old ones. Re-sending an endpoint updates it, and moves it to the caller
if another user had it.

**Body:**
```json
{ "endpoint": "https://fcm.googleapis.com/...", "keys": { "p256dh": "...", "auth": "..." } }
```

**Response `201`:** `{ "subscribed": true }`
**Errors:** `400` (malformed subscription), `503` (push not set up on the server)

---

### `DELETE /api/push/subscriptions`

Stop pushing to a device. **Body:** `{ "endpoint": "..." }`

**Response `204`:** No content. Devices the push service reports as gone
(`404`/`410`) are removed automatically.
---

## Automation Rules (`/api/projects/:projectId/automation-rules`) 🔒

US26. An automation rule watches one project's entries and applies an action
when its conditions hold. Rules run automatically when an entry is saved —
after `POST .../entries`, `PUT /api/entries/:id` and
`PATCH /api/entries/:id/status` — once the save has committed. Automation
never fails a save: a broken rule is logged and skipped, and the user's work
always survives.

Rule object:
```json
{
  "id": "...",
  "projectId": "...",
  "name": "Long session",
  "trigger": "ENTRY_CREATED",
  "conditions": [
    { "source": "ATTRIBUTE", "attribute": "durationMinutes", "operator": "GTE", "value": 240 }
  ],
  "action": { "type": "ADD_TAG", "tagId": "..." },
  "enabled": true,
  "invalidReason": null,
  "createdAt": "2026-09-27T10:00:00.000Z",
  "updatedAt": "2026-09-27T10:00:00.000Z"
}
```

`invalidReason` is `null` while the rule can run. A rule can go stale after it
is written — its field archived, its tag deleted — and then carries a human-
readable reason instead; the runner refuses to act on exactly these rules, so
a stale rule is inert rather than misfiring.

### `POST /api/projects/:projectId/automation-rules`

Create a rule. `name` (≤100 chars, unique per project), `trigger`
(`ENTRY_CREATED` | `ENTRY_UPDATED`), `conditions` (1–10, ANDed), `action`,
`enabled` (optional, default `true`). See
[Semantics and deliberate limitations](#semantics-and-deliberate-limitations)
for the condition and action shapes.

**Response `201`:** the rule.
**Errors:** `400` (malformed rule, or a `fieldId`/`tagId` that does not
belong to this project or its owner), `404` (project not found, or not the
caller's), `409` (duplicate name)

---

### `GET /api/projects/:projectId/automation-rules`

List the project's rules in execution order (oldest first, tie-broken by id)
— the same order the runner applies them.

**Response `200`:** array of rules.

---

### `GET /api/projects/:projectId/automation-rules/:id`

**Response `200`:** the rule.
**Errors:** `404` (rule not found, or not the caller's)

---

### `PATCH /api/projects/:projectId/automation-rules/:id`

Change any subset of `name`, `trigger`, `conditions`, `action`, `enabled`.
When conditions or action are supplied, the rule is validated **as it will be
after the edit** — swapping only the action can invalidate conditions that
were fine, and vice versa.

**Response `200`:** the updated rule.
**Errors:** `400` (malformed or invalid rule), `404` (rule not found, or not
the caller's), `409` (duplicate name)

---

### `DELETE /api/projects/:projectId/automation-rules/:id`

**Response `200`:** `{ "message": "Rule deleted" }`
**Errors:** `404` (rule not found, or not the caller's)

---

### Semantics and deliberate limitations

**Triggers.** `ENTRY_CREATED` fires on entry creation; `ENTRY_UPDATED` fires
on every later save, including a status-only change through
`PATCH /entries/:id/status` — so "when an entry is marked done" works no
matter which endpoint the UI reaches for.

**Conditions** are a flat AND list over either an entry attribute
(`durationMinutes`, `status`) or a project field (`fieldId`). Comparison
operators: `EQ`, `NEQ`, `GT`, `GTE`, `LT`, `LTE`; presence/truth operators:
`IS_EMPTY`, `IS_NOT_EMPTY`, `IS_TRUE`, `IS_FALSE`. Which operators apply is
gated by what the condition reads — NUMBER/COMPUTED fields get the
comparisons, TEXT/LINK get equality and presence, BOOLEAN gets
`IS_TRUE`/`IS_FALSE`. `DATE`, `TAGS`, `CHECKLIST` and `REFERENCE` fields
cannot be used in conditions at all: a stored `EntryValue` holds whatever
string passed `Date.parse`, so two dates meaning the same day could compare
unequal, and the story needs no date rules. Numeric parsing follows the same
strictness as statistics: `"12kg"` is not 12, a blank is not 0, and a value
that cannot be parsed makes the comparison false rather than coercing it.

**Actions** are `ADD_TAG`, `REMOVE_TAG` and `SET_STATUS` only. There is
deliberately no action that writes a field value (it would collide with
COMPUTED fields and required-field validation), none that sets a date, and
none that creates entries — that last would let one rule spawn unbounded
entries and would interact badly with offline replay. `SET_STATUS` maintains
`completedAt` exactly as a manual status change does.

**Ordering and idempotency.** Rules run oldest-first; when several rules set
the status, the last one wins. Every action is idempotent — `ADD_TAG` inserts
against the entry-tag composite key, `REMOVE_TAG` is a delete, `SET_STATUS`
skips a no-op write — so the offline queue replaying a capture cannot
double-apply a rule.

**No cascades.** Each pass evaluates every rule against one snapshot taken
before any action runs, and actions write directly rather than re-entering
the save handlers, so a rule's action cannot feed another rule's condition —
within the same pass or a later one.

**History.** `toSnapshot()` covers tags and status, so what automation did is
recorded as a further entry version: the user's save is version *n*,
automation's effect is *n+1*, visible and revertable in the history UI.

---

## Google Calendar (`/api/google-calendar`)

Syncs open entries' due dates into the user's primary Google Calendar using the
[Google Calendar API](https://developers.google.com/calendar/api) (OAuth 2.0,
scope `calendar.events`). Each open entry with a due date becomes an all-day
event. The logbook tags its events with private extended properties, so a sync
can find them again: it creates new events, updates events whose date or title
changed, and removes events for entries that were completed, undated, or deleted.
Events the user created themselves are never touched.

Google access and refresh tokens are stored per user, encrypted with AES-256-GCM
(`GOOGLE_TOKEN_ENCRYPTION_KEY`). They are never returned by the API.

### `GET /api/google-calendar/connect` 🔒

Returns the Google consent URL. The URL carries a signed, 10-minute `state`
token bound to the caller, which the callback requires.

**Response `200`:**
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?...&state=..." }
```
**Errors:** `500` (Google Calendar not configured on the server)

### `GET /api/google-calendar/callback`

Google redirects the browser here after consent. It is not called by the SPA.
The user is identified only from the signed `state`. On completion the
browser is redirected to `APP_URL/calendar?calendar=connected`, `=denied`
(the user cancelled), or `=error`.

| Query | Notes |
|---|---|
| `code` | Authorization code from Google |
| `state` | Signed state issued by `/connect` |

**Errors:** `400` (missing `code` or `state`), `401` (invalid or expired `state`)

### `GET /api/google-calendar/status` 🔒

**Response `200`:**
```json
{ "configured": true, "connected": true, "connectedAt": "2026-09-24T10:00:00.000Z" }
```

### `POST /api/google-calendar/sync` 🔒

Mirrors the caller's open, dated entries into Google Calendar. Safe to repeat.

**Response `200`:**
```json
{ "message": "Due dates synced to Google Calendar.", "created": 2, "updated": 1, "removed": 0 }
```
**Errors:** `400` (not connected), `409` (access was revoked in the Google
account; the connection is removed and the user must reconnect), `502`
(Google API failure)

### `DELETE /api/google-calendar/disconnect` 🔒

Revokes the grant at Google (best effort) and deletes the stored tokens.
Events that were already synced remain in the user's calendar.

**Response `200`:**
```json
{ "message": "Google Calendar connection removed." }
```

---

## Error Format

All error responses use a consistent JSON shape:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|---|---|
| `400` | Validation error (bad input, missing field, invalid enum) |
| `401` | Authentication failure (missing or invalid JWT, wrong password) |
| `403` | Forbidden (e.g. unverified account trying to log in) |
| `404` | Resource not found |
| `409` | Conflict (duplicate name or email) |

---

## External Integrations

| Service | Purpose | Configuration |
|---|---|---|
| **Neon** | Hosted PostgreSQL database | `DATABASE_URL` in `.env` |
| **Google Calendar API** | Syncs entry due dates to the user's calendar ([details](#google-calendar-apigoogle-calendar)) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `APP_URL` |
| **Resend** | Transactional email (preferred) | `RESEND_API_KEY` in `.env` |
| **Gmail SMTP** | Transactional email (fallback) | `EMAIL_USER` + `EMAIL_PASS` in `.env` |

When neither email provider is configured, the backend runs in **dev mode**:
registration auto-verifies and password-reset emails are logged to the
console instead of sent.

---

🔒 = requires `Authorization: Bearer <token>` header.

*Related: [Authentication & Security Guide](https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook/src/branch/main/apps/backend/AUTHENTICATION.md)
covers the 2FA lifecycle, password reset flow, and security properties in
detail. [Testing](testing.md) documents the automated test coverage for
every endpoint listed above.*
