# API Reference

This page documents every endpoint exposed by the Digital Logbook backend
API. All endpoints are prefixed with `/api` and return JSON responses.

**Base URL (production):**
`https://digital-logbook-backend-latest.onrender.com/api` — a prefix, not an
endpoint: request a path under it, such as `/api/health`.

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

### Errors

Every failure is JSON. A `4xx` carries the reason, because it is the caller's
to fix; a `5xx` carries only `{ "error": "Internal server error" }` and the
detail stays in the server log. A path no route matches answers:

```json
{ "error": "Not found" }
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

**Response `200`:** `{ "message": "Email verified successfully. You can now log in." }`
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
{ "requiresTwoFactor": true, "email": "...", "twoFactorToken": "eyJ..." }
```
No session token is issued yet. `twoFactorToken` proves the password step
succeeded; it is valid for five minutes and only for
[`POST /api/auth/login/2fa`](#post-apiauthlogin2fa).

**Errors:** `401` (wrong password or unknown email — identical message), `403` (unverified account), `429` (too many attempts)

---

### `POST /api/auth/login/2fa`

Complete sign-in after `POST /api/auth/login` returned `requiresTwoFactor`.
The account is identified by `twoFactorToken`, not by an email address, so a
code alone cannot sign anyone in.

| Field | Type | Required |
|---|---|---|
| `twoFactorToken` | string | Yes — from the `login` response |
| `code` | string | Yes — a 6-digit TOTP code, or a recovery code (`XXXXX-XXXXX`) |

**Response `200`:**
```json
{ "message": "Login successful", "token": "eyJ...", "user": { "id": "...", "fullName": "...", "email": "..." }, "scheduledDeletionAt": null, "usedRecoveryCode": false, "recoveryCodesRemaining": 10 }
```
A recovery code works once. When one is used, `usedRecoveryCode` is `true` so
the client can tell the user how many remain.

**Errors:** `400` (malformed request), `401` (invalid code, or the `twoFactorToken` has expired — sign in again), `429` (too many attempts)

---

### `POST /api/auth/forgot-password`

Request a password-reset email. Returns the same message regardless of
whether the email exists (prevents account enumeration).

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |

**Response `200`:**
```json
{ "message": "If account exists, a password reset email has been sent." }
```

---

### `POST /api/auth/reset-password`

Reset the password using a single-use token from the reset email.

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes |
| `newPassword` | string | Yes — same rules as registration |

**Response `200`:** `{ "message": "Password updated successfully. You can now log in." }`
**Errors:** `400` (invalid or expired token)

Every session issued before the reset stops working, so a token stolen before
the password was changed cannot be used after it.

---

### `POST /api/auth/logout` 🔒

End the session the request carries — and every other session for the same
account. The token is refused from the next request onwards, so a copy of it
is worthless the moment its owner signs out.

No body. **Response `204`** with no content.

Revocation is per account, not per device: the server keeps one version number
per user and stamps it into every token it issues; signing out increments it.
Ending only the calling device would need a per-token denylist and a job to
expire its entries. Resetting a password and scheduling an account for deletion
increment the same number, so those actions sign out every device too.

**Errors:** `401` (no token, or a token that was already withdrawn)

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
date and does not send another email. Scheduling it signs out every device on
the account, including the one that asked.

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

Begin 2FA setup — returns a TOTP secret and QR code data URL. The secret is
stored encrypted, and 2FA is not switched on until
[`verify-setup`](#post-apiauth2faverify-setup) succeeds.

**Response `200`:**
```json
{ "secret": "JBSWY3DPEHPK3PXP", "qrCodeUrl": "data:image/png;base64,..." }
```
**Errors:** `400` (2FA already enabled), `404` (user not found), `503` (the server has no `TWO_FACTOR_ENCRYPTION_KEY`)

---

### `POST /api/auth/2fa/verify-setup` 🔒

Verify the TOTP code from the authenticator app to complete 2FA setup.

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes — 6-digit TOTP code |

**Response `200`:**
```json
{ "message": "Two-factor authentication enabled successfully", "recoveryCodes": ["ABCDE-12345", "..."] }
```
The recovery codes are stored only as digests, so this response is the only
time they can be read. The client must show them to the user now.

**Errors:** `400` (incorrect code, no setup in progress, or 2FA already enabled)

---

### `POST /api/auth/2fa/disable` 🔒

Disable 2FA. Requires password re-authentication. The secret and all
recovery codes are removed.

| Field | Type | Required |
|---|---|---|
| `password` | string | Yes |

**Response `200`:** `{ "message": "Two-factor authentication disabled" }`
**Errors:** `400` (2FA not enabled), `401` (wrong password), `404` (user not found)

---

### `POST /api/auth/2fa/recovery-codes` 🔒

Replace the recovery codes with a new set. Every previous code stops working.
Requires the password, so a borrowed session cannot mint itself a way back in.

| Field | Type | Required |
|---|---|---|
| `password` | string | Yes |

**Response `200`:**
```json
{ "message": "New recovery codes generated. Your previous codes no longer work.", "recoveryCodes": ["ABCDE-12345", "..."] }
```
**Errors:** `400` (2FA not enabled), `401` (wrong password), `404` (user not found)

---

### `GET /api/auth/2fa/status` 🔒

Check whether 2FA is enabled for the authenticated user, and how many
recovery codes are left.

**Response `200`:**
```json
{ "isTwoFactorEnabled": true, "recoveryCodesRemaining": 8, "recoveryCodeCount": 10 }
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

### `GET /api/projects/time-summaries`

Time totals for every project the caller owns in one request, so the Projects
page does not need one request per project. Projects with no entries are
included with zero totals.

**Response `200`:**
```json
[
  { "projectId": "…", "totalMinutes": 180, "totalHours": 3, "entryCount": 5, "lastEntryAt": "2026-09-14T…" }
]
```

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

#### Field names are unique within a project

A project cannot have two live fields with the same name. The comparison
ignores case and surrounding whitespace, so `Hours`, `hours` and `  Hours  `
are the same name, and both creating and renaming are checked. A field that
has been removed is archived rather than deleted, and an archived name is
released for reuse.

The rule is enforced by a partial unique index on
`(project_id, lower(name)) WHERE archived_at IS NULL`, not only by the API
check — the API check is a read followed by a write and would race under
concurrent requests, so two simultaneous creations of the same name resolve
to one `201` and one `409` rather than two fields.

Duplicates used to be allowed, and the consequence was not cosmetic. A US22
expression such as `SUM({Double hours})` is refused as ambiguous, which made
the field unusable in statistics, and a US24 automation rule offered two
identically-labelled fields the student could not tell apart.

**Errors:** `409` (a live field in this project already has that name)

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
| `offset` | number | `0` | Rows to skip, for paging ("load more") |
| `archived` | string | `exclude` | `exclude`, `only` or `include` archived entries |
| `search` | string | — | Case-insensitive text matched against the project name, every field value and tag names. Results are ranked by relevance (see below) |
| `entryTab` | string | `all` | `all`, `week` (the last seven days) or `overdue` (open entries whose due date has passed) |
| `tags` | string | — | Comma-separated tag names; an entry matches if it has any of them |
| `sort` | string | `newest` | `newest` or `oldest`. Ignored while `search` is set, since results are then ranked by relevance |
| `filters` | string | — | JSON array of custom-field filters, `[{ "fieldId": "…", "op": "gt", "value": "2" }]`. Every filter must hold |

All the parameters combine: each one narrows the same result set.

**Custom-field filter operations**, by field type:

| Field type | `op` |
|---|---|
| `TEXT` | `contains`, `equals` |
| `NUMBER` | `equals`, `gt`, `lt` |
| `BOOLEAN` | `is_true`, `is_false` |
| `DATE` | `on`, `before`, `after` |
| `TAGS` | `has_tag` |

An unknown field, an operation the field's type does not support, or a
non-numeric value for a `NUMBER` filter returns `400`.

`from` and `to` filter on `COALESCE(entryDate, createdAt)` — the date the
interface shows. An entry backdated to March counts as March, not as the day
it was typed, which is what the timeline and calendar already display.

Without `search`, results are ordered by that same date (newest first unless
`sort=oldest`), with the entry id as a tiebreaker so the order is stable
between identical dates.

**Relevance ranking.** With `search`, each entry is scored: 3 if the project
name matches, plus 3 for each matching text field, 2 for each matching tags
field, 1 for each other matching field, and 2 for each matching tag. Results
are ordered by score, then newest first.

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
  "offset": 0,
  "truncated": false,
  "stats": { "total": 42, "weekCount": 5, "weekMinutes": 310, "overdueCount": 1, "streak": 3 }
}
```

`stats` covers the whole filtered set, not just the page returned: how many
entries match, how many and how many minutes fall in the last seven days, how
many are overdue, and the current run of consecutive days with an entry.

Unlike `GET /api/projects/:projectId/entries`, an entry does not carry its
own `format`. Each entry names its `formatVersionId` and the snapshots are
returned once in the shared `formats` map — a term of entries on a nine-field
project would otherwise be mostly repeated schema. An entry predating format
versioning has `formatVersionId: null`.

`truncated` is `true` when exactly `limit` rows were returned, meaning there
may be more. To fetch the next page, repeat the request with `offset`
increased by `limit`.

**Errors:** `400` for an unknown `projectStatus` or `archived` value, a
non-positive `limit`, a negative `offset`, or an unparseable `from`/`to`.
`401` when the token is missing or invalid.

---

### `GET /api/me/open-entries`

Every `OPEN` entry across all of the authenticated user's projects, newest
first, in one request. Used by the Open Work page instead of one request per
project.

**Response `200`:** an array of entry objects, each with its own `format` and
an added `projectName`.

**Errors:** `401`

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

Each value is checked against its field's type. A **REFERENCE** value is
`{ "id": "...", "label": "...", "kind": "project" | "entry" }` and must point
at one of the caller's own projects (`kind: "project"`, the default when
`kind` is missing) or entries (`kind: "entry"`). A reference to something
that does not exist, belongs to another user, or is not the kind it declares
is refused with `400`, e.g. `"Related to" must reference one of your
projects.` The same check applies to `PUT /api/entries/:id`.

**Errors:** `400` (invalid or missing required value, broken reference), `404` (project not found)

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

## Backup & Restore (`/api/import`) 🔒

### `POST /api/import`

Restore a JSON backup made by **Settings → Export / Import**. The whole backup is imported in one database transaction: either every project, field and entry in the file is imported, or nothing is. That means a failed import can simply be retried.

The body is the backup file itself (up to 10 MB):

| Field | Type | Required |
|---|---|---|
| `format` | string | Yes — `"digital-logbook-backup"` |
| `version` | number | Yes — `1` |
| `projects` | array | Yes — each with `name`, `description`, `status`, `fields` (`id`, `name`, `type`, `required`, `formula`) and `entries` (`durationMinutes`, `entryDate`, `dueDate`, `values` keyed by the backup's field ids). Optional: the project's `id`, `tags`, `createdAt`, `updatedAt`; each entry's `id`, `status`, `completedAt`, `tags`, `archived`, `archivedAt`, `createdAt`, `updatedAt` |

- Projects, fields and entries get new ids. Entry values, computed-field formulas and references are rewritten to point at them: a project reference by the project's old `id` (or by its name, for a backup without ids), and an entry reference by the entry's old `id`, even when that entry comes later in the file. A reference to anything outside the backup is dropped.
- Project tags, entry tags, completion and archive dates, and the original `createdAt`/`updatedAt` are restored as they were. A backup without them still imports: completed and archived entries are then dated at the import.
- Computed results are recalculated rather than copied from the file.
- If a project's name is already taken, it is imported as `Name (imported)`, `Name (imported 2)` and so on.
- Required fields are not enforced, so entries logged before a field became required still restore.

**Response `201`:** `{ "projects": 2, "entries": 37 }`
**Errors:** `400` (not a valid backup, or an invalid field, formula or entry value), `409` (two fields in one project whose names differ only by case). Every error message ends with "Nothing was imported."

---

## Statistics (`/api/...`) 🔒

### `POST /api/projects/:projectId/stats/group`

Aggregate entry field values with grouping.

| Field | Type | Required | Notes |
|---|---|---|---|
| `metricFieldId` | string | Yes | ID of the field to aggregate |
| `operation` | string | Yes | `sum`, `avg`, `min`, `max` or `count`. All but `count` need a Number or Computed field |
| `groupByFieldId` | string | No | ID of the field to group by |

Blank and non-numeric values are left out of the calculation rather than
failing it.

**Response `200`:**
```json
{ "groups": [{ "key": "Category A", "value": 195 }] }
```
Without `groupByFieldId`, there is one group with `key: "total"`.

**Errors:** `400` (missing field, bad operation, type mismatch), `404` (project or field not found)

---

### `POST /api/projects/:projectId/stats/timeline`

Plot entries over time: how many fall in each bucket, or the total of a
numeric field per bucket.

| Field | Type | Required | Notes |
|---|---|---|---|
| `dateFieldId` | string | Yes | ID of a DATE-type field |
| `bucket` | string | No | `day` (default), `week`, or `month` |
| `operation` | string | No | `count` (default) or `sum` |
| `metricFieldId` | string | For `sum` | A Number or Computed field to total |

**Response `200`:**
```json
{ "points": [{ "date": "2026-09-01", "value": 5 }, { "date": "2026-09-02", "value": 3 }] }
```
**Errors:** `400` (invalid bucket or operation, non-DATE field, missing field), `404` (project or field not found)

---

### `POST /api/projects/:projectId/stats/expression`

Evaluate a custom expression (US22) across every entry in the project, and
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

## Custom Statistics (`/api/projects/:projectId/custom-statistics`) 🔒

US23. A saved custom expression with a name, kept alongside the built-in
statistics and available as a dashboard panel. Only the definition is stored:
every read works the value out from the project's current entries, so a saved
statistic follows the data instead of freezing the number it had when saved.

A statistic object:
```json
{ "id": "...", "projectId": "...", "name": "Average hours", "expression": "AVG({Hours})", "value": 3.42, "error": null, "createdAt": "...", "updatedAt": "..." }
```
If a statistic can no longer be worked out (for example, its field was renamed
or deleted), `value` is `null` and `error` says why, instead of the whole
request failing.

Names and expressions are trimmed. A name is up to 100 characters and unique
within the project; an expression is up to 500 characters and uses the
[expression syntax](#post-apiprojectsprojectidstatsexpression).

### `POST /api/projects/:projectId/custom-statistics`

Save a statistic. The expression is checked against the project's fields but
does not need any entries yet.

| Field | Type | Required |
|---|---|---|
| `name` | string | Yes |
| `expression` | string | Yes |

**Response `201`:** the statistic object.
**Errors:** `400` (empty name or expression, invalid expression), `404` (project not found), `409` (name already used in this project)

### `GET /api/projects/:projectId/custom-statistics`

The project's statistics, oldest first, each with its current value.

**Response `200`:** an array of statistic objects.

### `GET /api/projects/:projectId/custom-statistics/:id`

One statistic with its current value.

**Response `200`:** the statistic object.
**Errors:** `404` (project or statistic not found)

### `PATCH /api/projects/:projectId/custom-statistics/:id`

Rename a statistic or change its expression. At least one must be given.

| Field | Type | Required |
|---|---|---|
| `name` | string | No |
| `expression` | string | No |

**Response `200`:** the updated statistic object.
**Errors:** `400`, `404`, `409` (as for create)

### `DELETE /api/projects/:projectId/custom-statistics/:id`

**Response `200`:** `{ "message": "Statistic deleted" }`
**Errors:** `404` (project or statistic not found)

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
| `ASSESSMENT` | A dated, unmarked My Grades assessment with `remind` on is 5 days away (one reminder, kept until 3 days before) or 2 days away (a second, kept until the day). New ones appear from 08:00 in `timeZone`. Needs `assessmentEnabled` |

Rules are evaluated whenever reminders are read (`GET /reminders` and
`GET /reminders/count`). Each condition produces at most one reminder, so a
completed or dismissed reminder stays that way while the condition holds. A
pending generated reminder whose condition lapses is marked `COMPLETED` if
its entry was marked done (or, for `DAILY_LOG`, something was logged; for
`ASSESSMENT`, the assessment was marked or recorded as missed), and removed
otherwise, e.g. when the due date moves or the rule is switched off.
Deleting an assessment deletes its reminders.
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
  },
  "assessment": null
}
```
For an `ASSESSMENT` reminder, `entry` is `null` and `assessment` is
`{ "id", "moduleId", "moduleCode", "name", "date": "2026-11-15", "dateKind": "TEST" }`.

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
  "timeZone": "UTC",
  "assessmentEnabled": true
}
```

---

### `PUT /api/reminders/settings`

Update any subset of the rules. `dueSoonDays` 0–30, `staleDays` 1–365,
`dailyLogTime` `HH:MM`, `timeZone` an IANA zone name, `assessmentEnabled` a boolean.

**Response `200`:** the full rules.
**Errors:** `400` (out-of-range or invalid value)

---

## Dashboard layout (`/api/dashboard`) 🔒

US25/US26. The panels on the caller's dashboard, in the order they arranged
them, saved to their account so the layout is the same on every device. A
built-in panel is named by its id (`"activity"`, `"recent-entries"`, …). A
saved statistic (US23) is `"stat:<projectId>:<statisticId>"`, and the
dashboard reads its value from `GET /projects/:projectId/custom-statistics/:id`.
The frontend skips ids it doesn't know, so the server only checks their format.

### `GET /api/dashboard/layout`

**Response `200`:** `{ "panels": ["tags", "stat:<uuid>:<uuid>"], "updatedAt": "..." }`,
or `{ "panels": null, "updatedAt": null }` when the caller has never saved one
(the default dashboard). An empty array is a saved, empty dashboard.

---

### `PUT /api/dashboard/layout`

Replace the saved layout. **Body:** `{ "panels": ["recent-entries", "activity"] }`
(at most 50, each once).

**Response `200`:** the saved layout.
**Errors:** `400` (not an array, unknown id format, duplicates, too many)

---

### `DELETE /api/dashboard/layout`

Go back to the default dashboard. **Response `204`:** No content.

---

## Saved filters (`/api/saved-filters`) 🔒

Named Entries-page filters, kept on the account so they follow the student
between browsers and devices. The web app caches them in `localStorage` for
offline use; a filter saved offline (or before filters were kept on the
account) is uploaded on the next visit.

A saved filter object:
```json
{ "id": "...", "name": "Overdue reports", "searchQuery": "report", "filterProjectId": "all", "filterTab": "overdue", "sortOrder": "newest", "selectedTags": ["exam"], "fieldFilters": [{ "fieldId": "...", "op": "gt", "value": "2" }], "archivedFilter": "include", "createdAt": "..." }
```

### `GET /api/saved-filters`

The caller's saved filters, oldest first.

**Response `200`:** Array of saved filter objects.

### `POST /api/saved-filters`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | Trimmed; 1–100 characters |
| `filters` | object | Yes | `searchQuery`, `filterProjectId`, `filterTab` (`all`/`week`/`overdue`), `sortOrder` (`newest`/`oldest`), and optionally `selectedTags`, `fieldFilters`, `archivedFilter` (`exclude`/`include`/`only`) |

**Response `201`:** The saved filter object.
**Errors:** `400` (blank name, malformed filters, or already 50 saved filters)

### `DELETE /api/saved-filters/:id`

**Response `204`:** No content.
**Errors:** `404` (not found, or not the caller's)

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

US24. An automation rule watches one project's entries and applies an action
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

## My Grades (`/api/grades`) 🔒

FEAT-009. A student's university modules and the assessments that make up their
marks. The API stores and returns exactly what the student entered; every grade
figure (secured points, averages, required marks, what-if projections) is
worked out in the browser by the grade engine, `apps/frontend/src/lib/grades.ts`.

**Two levels of weighting.** An assessment's `weight` is its share of its
*section*. A `SEMESTER` module has one section worth 100%. A `FULL_YEAR` module
has Semester 1 and Semester 2: `semester1Weight` is Semester 1's share of the
module and Semester 2 counts for the rest, so the two always total 100. There is
no default split.

**Ownership.** Every route needs a signed-in student. Any route naming a
`:moduleId` or `:assessmentId` only ever finds the caller's own record: another
student's id, or a malformed one, is `404`.

A module object:
```json
{
  "id": "...", "code": "COMS3011A", "name": "Software Design", "academicYear": 2026,
  "type": "SEMESTER", "semester": 2, "semester1Weight": null, "targetMark": 50,
  "createdAt": "...", "updatedAt": "...",
  "assessments": [ /* assessment objects, in the student's order */ ]
}
```

An assessment object:
```json
{
  "id": "...", "moduleId": "...", "name": "Midterm", "section": null, "weight": 40,
  "markObtained": 25, "markMax": 40, "markPercent": null, "missed": false,
  "date": "2026-11-15", "dateKind": "TEST", "remind": true, "position": 0, "createdAt": "...", "updatedAt": "..."
}
```

- A mark is either `markObtained` out of `markMax`, or `markPercent`, or neither
  (not marked yet). `missed: true` counts as 0% and cannot carry a mark.
- `date` is a calendar day, `YYYY-MM-DD`, with no time and so no time zone.
  `dateKind` (`DUE` or `TEST`) is given exactly when `date` is.
- Weights, percentages and marks allow at most two decimal places.
- There is no `status` field: it is derived from the mark by the grade engine.

### `GET /api/grades/modules?year=<year>`

The caller's modules with their assessments, newest year first, then by code.
`year` is optional.

**Response `200`:** an array of module objects.
**Errors:** `400` (`year` is not a year from 2000 to 2100)

### `POST /api/grades/modules`

| Field | Type | Required |
|---|---|---|
| `code` | string, up to 20 characters; trimmed and upper-cased | Yes |
| `name` | string | Yes |
| `academicYear` | integer, 2000–2100 | Yes |
| `type` | `SEMESTER` or `FULL_YEAR` | Yes |
| `semester` | `1` or `2` | For `SEMESTER` only |
| `semester1Weight` | number, 0–100 | For `FULL_YEAR` only |
| `targetMark` | number, 0–100, or `null` | No |

**Response `201`:** the module object.
**Errors:** `400` (invalid field, or a field that doesn't fit the type), `409` (the same code already exists for that year; repeating a module in a later year is fine)

### `GET /api/grades/modules/:moduleId`

**Response `200`:** the module object.
**Errors:** `404`

### `PATCH /api/grades/modules/:moduleId`

Any of the create fields; at least one. To change `type`, send the field the new
type needs and `null` for the one it doesn't. A semester module's assessments
move into the semester it ran in; a full-year module can only become a semester
module while all of its assessments are in one semester.

**Response `200`:** the updated module object.
**Errors:** `400`, `404`, `409` (duplicate code, or assessments in both semesters)

### `DELETE /api/grades/modules/:moduleId`

Deletes the module and its assessments.

**Response `204`.**
**Errors:** `404`

### `POST /api/grades/modules/:moduleId/assessments`

| Field | Type | Required |
|---|---|---|
| `name` | string, up to 120 characters | Yes |
| `weight` | number, 0–100 (share of its section) | Yes |
| `section` | `1` or `2` | In a `FULL_YEAR` module only |
| `markObtained`, `markMax` | numbers, `markMax` above 0 and `markObtained` no more than it | No |
| `markPercent` | number, 0–100 | No |
| `missed` | boolean | No |
| `date` | `YYYY-MM-DD` | No |
| `dateKind` | `DUE` or `TEST` | With `date` |
| `remind` | boolean: reminders 5 and 2 days before the date | No (defaults to `true`) |
| `position` | integer | No (defaults to the end) |

**Response `201`:** the assessment object.
**Errors:** `400`, `404` (module not found)

### `PATCH /api/grades/assessments/:assessmentId`

Any of the create fields; at least one. The mark (`markObtained`, `markMax`,
`markPercent`, `missed`) and the date (`date`, `dateKind`) are each replaced as
a whole: send any part and the parts left out are cleared, so switching from
25/40 to 62.5% can't leave both behind.

**Response `200`:** the updated assessment object.
**Errors:** `400`, `404`

### `DELETE /api/grades/assessments/:assessmentId`

**Response `204`.**
**Errors:** `404`

---

## Google Calendar (`/api/google-calendar`)

Syncs open entries' due dates into the user's primary Google Calendar using the
[Google Calendar API](https://developers.google.com/calendar/api) (OAuth 2.0,
scope `calendar.events`). Each open, unarchived entry with a due date becomes
an all-day event — the same work Open Work lists. The logbook tags its events
with private extended properties, so a sync can find them again: it creates new
events, updates events whose date or title changed, and removes events for
entries that were completed, undated, archived, or deleted.
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
**Errors:** `503` (Google Calendar is not configured on this server)

### `GET /api/google-calendar/callback`

Google redirects the browser here after consent. It is not called by the SPA.
The user is identified only from the signed `state`. On completion the
browser is redirected to `APP_URL/calendar?calendar=connected`, `=denied`
(the user cancelled), or `=error`.

| Query | Notes |
|---|---|
| `code` | Authorization code from Google |
| `state` | Signed state issued by `/connect` |

**Errors:** `400` (missing `code` or `state`), `401` (invalid or expired `state`),
`503` (not configured on this server)

### `GET /api/google-calendar/status` 🔒

**Response `200`:**
```json
{ "configured": true, "connected": true, "connectedAt": "2026-09-24T10:00:00.000Z" }
```

### `POST /api/google-calendar/sync` 🔒

Mirrors the caller's open, dated, unarchived entries into Google Calendar. Safe to repeat.

**Response `200`:**
```json
{ "message": "Due dates synced to Google Calendar.", "created": 2, "updated": 1, "removed": 0 }
```
**Errors:** `400` (not connected), `409` (access was revoked in the Google
account; the connection is removed and the user must reconnect), `502`
(Google API failure), `503` (not configured on this server)

### `DELETE /api/google-calendar/disconnect` 🔒

Revokes the grant at Google (best effort) and deletes the stored tokens.
Events that were already synced remain in the user's calendar.

**Response `200`:**
```json
{ "message": "Google Calendar connection removed." }
```

---

## Profile (`/api/me`) 🔒

Both endpoints act on the account in the token. There is no id in the URL, so
one student cannot read or change another's profile.

### `GET /api/me`

The signed-in student's profile.

**Response `200`:**
```json
{
  "id": "…",
  "email": "student@example.com",
  "fullName": "Thandi Mokoena",
  "isEmailVerified": true,
  "bio": null,
  "avatar": null,
  "studentNumber": "2812345",
  "degree": "BSc Computer Science",
  "yearOfStudy": "3rd year",
  "memberSince": "2026-08-01T…"
}
```

**Errors:** `404` (the account was deleted while the token was still valid)

### `PATCH /api/me`

Update the editable profile fields. A field left out is not changed; `null`
or `""` clears it.

| Field | Type | Notes |
|---|---|---|
| `fullName` | string | Up to 255 characters. Cannot be cleared |
| `bio` | string \| null | Up to 280 characters |
| `studentNumber` | string \| null | Up to 32 characters |
| `degree` | string \| null | Up to 120 characters |
| `yearOfStudy` | string \| null | Up to 32 characters |
| `avatar` | string \| null | A PNG, JPEG or WebP `data:` URL, under 512 KB once encoded |

The email address, password and two-factor settings cannot be changed here.

**Response `200`:** The updated profile, as for `GET /api/me`.
**Errors:** `400` (a field is too long, the name is empty, or the image is invalid), `404` (account not found)

---

## Help assistant (`/api/assistant`) 🔒

An in-app helper that answers "how do I…?" questions about Digital Logbook,
backed by the [Gemini API](https://ai.google.dev/). It is given a written guide
to the app and may suggest one page to open. Only the conversation and the
page the user is on are sent to Gemini — no logbook data. Rate-limited per IP
(`RATE_LIMIT_ASSISTANT_MAX` per `RATE_LIMIT_ASSISTANT_WINDOW_MINUTES`).

### `POST /api/assistant/chat` 🔒

| Field | Type | Required | Notes |
|---|---|---|---|
| `messages` | `{ role: "user" \| "model", text: string }[]` | Yes | The conversation so far, oldest first. Must start and end with a `user` message; each text is 1–1000 characters; only the last 20 are used |
| `currentPath` | string | No | The page the user is on, e.g. `/entries`; up to 200 characters, passed on only if it looks like an app path |

**Response `200`:**
```json
{ "reply": "Open Reminders and press New reminder.", "navigateTo": "/reminders" }
```
`navigateTo` is one of the app's pages (`/dashboard`, `/projects`, `/entries`,
`/open-work`, `/stats`, `/calendar`, `/board`, `/reminders`, `/grades`,
`/profile`, `/settings`) or `null`.

**Errors:** `400` (invalid conversation), `429` (rate limited), `502` (no
configured Gemini model could answer), `503` (no `GEMINI_API_KEY` on this server)

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
| `404` | Resource not found — also returned for a resource that belongs to another user, so its existence is not revealed |
| `409` | Conflict (duplicate name or email) |
| `429` | Too many requests — the rate limit on sign-in, sign-up, 2FA or the help assistant was hit; wait and try again |
| `500` | Unexpected server error |
| `502` | An external service failed (Google Calendar, or every Gemini model for the help assistant) |
| `503` | A feature is not configured on this server (the 2FA encryption key, the push keys, Google Calendar or the Gemini key) |

Request bodies that fail Zod validation on the auth routes return
`{ "errors": { "<field>": ["message"] } }` instead of a single `error`
string.

---

## External Integrations

| Service | Purpose | Configuration |
|---|---|---|
| **Neon** | Hosted PostgreSQL database | `DATABASE_URL` in `.env` |
| **Google Calendar API** | Syncs entry due dates to the user's calendar ([details](#google-calendar-apigoogle-calendar)) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `APP_URL` |
| **Gemini API** | The in-app help assistant ([details](#help-assistant-apiassistant)) | `GEMINI_API_KEY`, optional `GEMINI_MODEL` |
| **Resend** | Transactional email (preferred) | `RESEND_API_KEY` in `.env` |
| **Gmail SMTP** | Transactional email (fallback) | `GMAIL_USER` + `GMAIL_APP_PASSWORD` in `.env` |
| **Web push** | Reminder notifications to subscribed devices ([details](#push-notifications-apipush)) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, optional `VAPID_SUBJECT` |

When neither email provider is configured, the backend runs in **dev mode**:
registration auto-verifies and password-reset emails are logged to the
console instead of sent.

---

🔒 = requires `Authorization: Bearer <token>` header.

*Related: [Authentication & Security Guide](https://github.com/DiMpho-20/coms3011a-logbook-digital-logbook/blob/main/apps/backend/AUTHENTICATION.md)
covers the 2FA lifecycle, password reset flow, and security properties in
detail. [Testing](testing.md) documents the automated test coverage for
every endpoint listed above.*
