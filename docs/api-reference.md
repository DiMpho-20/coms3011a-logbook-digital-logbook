# API Reference

This page documents every endpoint exposed by the Digital Logbook backend
API. All endpoints are prefixed with `/api` and return JSON responses.

**Base URL (production):**
`https://digital-logbook-backend-latest.onrender.com/api`

**Authentication:** Most endpoints require a JWT in the
`Authorization: Bearer <token>` header. Obtain one via the
[`POST /auth/login`](#post-authlogin) endpoint.

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

### `POST /auth/register`

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

### `POST /auth/verify-email`

Verify a user's email address with the token sent during registration.

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes |

**Response `200`:** `{ "message": "Email verified successfully." }`
**Errors:** `400` (invalid or expired token)

---

### `POST /auth/login`

Authenticate and receive a JWT. If 2FA is enabled, returns a flag
instead of a token.

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |
| `password` | string | Yes |

**Response `200` (no 2FA):**
```json
{ "token": "eyJ...", "user": { "id": "...", "fullName": "...", "email": "..." } }
```
**Response `200` (2FA enabled):**
```json
{ "requiresTwoFactor": true, "email": "..." }
```
**Errors:** `401` (wrong password or unknown email — identical message), `403` (unverified account)

---

### `POST /auth/login/2fa`

Complete 2FA login after `POST /auth/login` returned `requiresTwoFactor`.

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |
| `token` | string | Yes — 6-digit TOTP code |

**Response `200`:**
```json
{ "token": "eyJ...", "user": { "id": "...", "email": "..." } }
```
**Errors:** `401` (invalid code), `400` (malformed code)

---

### `POST /auth/forgot-password`

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

### `POST /auth/reset-password`

Reset the password using a single-use token from the reset email.

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes |
| `newPassword` | string | Yes — same rules as registration |

**Response `200`:** `{ "message": "Password reset successfully." }`
**Errors:** `400` (invalid or expired token)

---

### `DELETE /auth/account` 🔒

Permanently delete the authenticated user's account and all associated
data (projects, entries, values, tokens).

| Field | Type | Required |
|---|---|---|
| `confirmPassword` | string | Yes |

**Response `200`:** `{ "message": "Account deleted." }`
**Errors:** `401` (wrong password)

---

### `POST /auth/2fa/setup` 🔒

Begin 2FA setup — returns a TOTP secret and QR code data URL.

**Response `200`:**
```json
{ "secret": "JBSWY3DPEHPK3PXP", "qrCode": "data:image/png;base64,..." }
```
**Errors:** `400` (2FA already enabled)

---

### `POST /auth/2fa/verify-setup` 🔒

Verify the TOTP code from the authenticator app to complete 2FA setup.

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes — 6-digit TOTP code |

**Response `200`:** `{ "message": "2FA enabled." }`
**Errors:** `400` (incorrect code)

---

### `POST /auth/2fa/disable` 🔒

Disable 2FA. Requires password re-authentication.

| Field | Type | Required |
|---|---|---|
| `password` | string | Yes |

**Response `200`:** `{ "message": "2FA disabled." }`
**Errors:** `401` (wrong password)

---

### `GET /auth/2fa/status` 🔒

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
| `type` | string | Yes | `TEXT`, `NUMBER`, `DATE`, `BOOLEAN`, `COMPUTED` |
| `required` | boolean | No | Default `false` |
| `formula` | string | No | Required when `type` is `COMPUTED`; e.g. `{field-id} * 2` |

**Response `201`:** Created entry field object.

---

### `GET /api/projects/:projectId/entry-fields`

List all entry fields for a project (including archived).

**Response `200`:** Array of entry field objects.

---

### `GET /api/projects/:projectId/entry-format-versions`

List all format version snapshots for a project.

**Response `200`:** Array of format version objects.

---

### `PUT /api/entry-fields/:id`

Update an entry field (name, required, formula).

**Response `200`:** Updated entry field object.

---

### `DELETE /api/entry-fields/:id`

Soft-delete (archive) an entry field. Existing entries retain their
values; the field is hidden from new entry forms.

**Response `200`:** `{ "message": "Field archived." }`

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
| `dueDate` | string | No | ISO date (YYYY-MM-DD) |

**Response `201`:** Created entry object with `status: "OPEN"`.

---

### `GET /api/projects/:projectId/entries`

List entries for a project. Supports filtering.

| Query param | Type | Notes |
|---|---|---|
| `status` | string | Filter by `OPEN` or `DONE` |
| `dueBefore` | string | ISO date — returns entries due before this date |

**Response `200`:** Array of entry objects.

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
| **Resend** | Transactional email (preferred) | `RESEND_API_KEY` in `.env` |
| **Gmail SMTP** | Transactional email (fallback) | `EMAIL_USER` + `EMAIL_PASS` in `.env` |

When neither email provider is configured, the backend runs in **dev mode**:
registration auto-verifies and password-reset emails are logged to the
console instead of sent.

---

🔒 = requires `Authorization: Bearer <token>` header.

*Related: [Authentication & Security Guide](../apps/backend/AUTHENTICATION.md)
covers the 2FA lifecycle, password reset flow, and security properties in
detail. [Testing](testing.md) documents the automated test coverage for
every endpoint listed above.*
