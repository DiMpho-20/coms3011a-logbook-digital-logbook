# Database Design

## Overview

The Digital Logbook uses a PostgreSQL database to store users, projects,
project entry formats, and logbook entries.

A key design goal was that different projects need different logbook
entry structures (e.g. one project may track "hours worked" and "task
completed", while another tracks "description" and "outcome"). Rather
than hardcoding a fixed set of columns for logbook entries, we adopted
an **Entity-Attribute-Value (EAV)** pattern using `ENTRY_FIELD` and
`ENTRY_VALUE`. This trades some query simplicity for the flexibility of
letting each project define its own entry format without requiring
schema changes.

We use **UUIDs** rather than auto-incrementing integers as primary keys
to avoid exposing sequential, guessable IDs and to make it easier to
merge or migrate data across environments without ID collisions.

## Entity Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ PROJECT : owns
    USER ||--o{ PASSWORD_RESET : requests
    PROJECT ||--o{ ENTRY_FIELD : defines
    PROJECT ||--o{ ENTRY_FORMAT_VERSION : snapshots
    PROJECT ||--o{ LOGBOOK_ENTRY : contains
    PROJECT ||--o{ AUTOMATION_RULE : automates
    LOGBOOK_ENTRY }o--o| ENTRY_FORMAT_VERSION : "pinned to"
    LOGBOOK_ENTRY ||--o{ ENTRY_VALUE : has
    ENTRY_FIELD ||--o{ ENTRY_VALUE : defines

    USER {
        uuid id PK
        string full_name
        string email UK
        string password_hash
        boolean is_email_verified
        string email_verification_token "nullable"
        datetime email_verification_expiry "nullable"
        string two_factor_secret "nullable — TOTP secret"
        boolean is_two_factor_enabled "default false"
        datetime scheduled_deletion_at "nullable"
        datetime created_at
        datetime updated_at
    }

    PROJECT {
        uuid id PK
        uuid user_id FK
        string name
        string description
        enum status "ACTIVE, ARCHIVED"
        datetime created_at
        datetime updated_at
    }

    ENTRY_FIELD {
        uuid id PK
        uuid project_id FK
        string name
        enum type "TEXT, NUMBER, DATE, BOOLEAN, TAGS, CHECKLIST, LINK, REFERENCE, COMPUTED"
        boolean required
        text formula "COMPUTED fields only"
        datetime archived_at "nullable — soft retire"
        datetime created_at
        datetime updated_at
    }

    ENTRY_FORMAT_VERSION {
        uuid id PK
        uuid project_id FK
        int version
        jsonb fields "immutable field snapshot"
        datetime created_at
    }

    LOGBOOK_ENTRY {
        uuid id PK
        uuid project_id FK
        int duration_minutes
        date entry_date
        date due_date
        enum status "OPEN, DONE"
        datetime completed_at "nullable"
        uuid format_version_id FK "nullable"
        datetime created_at
        datetime updated_at
    }

    ENTRY_VALUE {
        uuid id PK
        uuid entry_id FK
        uuid field_id FK
        text value
    }

    PASSWORD_RESET {
        uuid id PK
        uuid user_id FK
        string token_hash UK
        datetime expires_at
        datetime created_at
    }

    AUTOMATION_RULE {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        string name
        enum trigger "ENTRY_CREATED, ENTRY_UPDATED"
        jsonb conditions "AND list, 1-10"
        jsonb action "ADD_TAG, REMOVE_TAG or SET_STATUS"
        boolean enabled "default true"
        datetime created_at
        datetime updated_at
    }
```

### Enums

| Enum | Values | Used by |
|---|---|---|
| `ProjectStatus` | `ACTIVE`, `ARCHIVED` | `projects.status` |
| `EntryFieldType` | `TEXT`, `NUMBER`, `DATE`, `BOOLEAN`, `TAGS`, `CHECKLIST`, `LINK`, `REFERENCE`, `COMPUTED` | `entry_fields.type` |
| `EntryStatus` | `OPEN`, `DONE` | `logbook_entries.status` |
| `AutomationTrigger` | `ENTRY_CREATED`, `ENTRY_UPDATED` | `automation_rules.trigger` |

### Constraints

- `USER.email` — Unique. Each email can only register once.
- `PROJECT(user_id, name)` — Unique. A student cannot have two projects with the same name.
- `ENTRY_VALUE(entry_id, field_id)` — Unique. One value per field per entry.
- `ENTRY_FORMAT_VERSION(project_id, version)` — Unique. Version numbers increment per project.
- `AUTOMATION_RULE(project_id, name)` — Unique. A project cannot have two rules with the same name.
- All foreign keys use `ON DELETE CASCADE` for full account erasure, except `logbook_entries.format_version_id`, which uses `ON DELETE SET NULL` — deleting a snapshot must not destroy entries.

## Main Entities

### User

Represents a student using the Digital Logbook.

A user can have multiple projects and can request multiple password
resets over time.

Passwords are stored as a salted hash (`password_hash`), never as
plain text.

Authentication-related columns:

- `is_email_verified`, `email_verification_token`, `email_verification_expiry` — email ownership is proven before login is allowed. The token is 32 random bytes and expires after one hour.
- `two_factor_secret`, `is_two_factor_enabled` — optional TOTP two-factor authentication. The secret is staged at setup time and only becomes active (`is_two_factor_enabled = true`) after the user proves their authenticator works. Both columns are nullable / default-false, so they are fully backward compatible.
- `scheduled_deletion_at` — reserved for delayed account-deletion jobs.

See `apps/backend/AUTHENTICATION.md` in the repository for the full
authentication design.

### Project

Represents a separate project belonging to a student.

A project can contain multiple entry fields, format versions, and
logbook entries. Archiving sets `status = ARCHIVED`; entries stay
editable either way.

### Entry Field

Defines the structure of a project's logbook entries.

For example, a project could define fields such as:

- Description (TEXT)
- Date (DATE)
- Hours worked (NUMBER)
- Task completed (BOOLEAN)

`type` is enforced at the application layer when validating
`ENTRY_VALUE.value`, since the value itself is stored as a string to
support different field types.

Sprint 2 extended the field types beyond the basic four:

| Type | Meaning |
|---|---|
| `TAGS` | A list of short labels |
| `CHECKLIST` | A list of checkable items |
| `LINK` | A reference to another entry in the same project |
| `REFERENCE` | A reference to an entry in a different project |
| `COMPUTED` | A value derived from other fields via `formula` rather than typed in |

`archived_at` implements **soft retirement**: a field dropped from the
format stops appearing on new entry forms, but existing values remain
readable in old entries. `formula` is only populated for `COMPUTED`
fields and stores the expression the server evaluates on save.

### Entry Format Version

An **immutable snapshot** of a project's entry format, taken whenever
the format changes (field added, dropped, renamed, or re-typed).

This is what keeps historical entries readable: each entry pins the
format version that was current when it was created
(`format_version_id`), so later format changes never break old entries.
Changing a format creates a new snapshot and carries existing entries
forward — filling in what it reasonably can — rather than abandoning
them.

The snapshot itself is stored as `JSONB` (`fields`), which keeps the
whole field definition set together and queryable.

### Logbook Entry

Represents a recorded activity within a project.

An entry stores the date it was recorded (`entry_date`, user-editable
for backdating), the amount of time spent (`duration_minutes`), an
optional deadline (`due_date`), and its completion state:

- `status` — `OPEN` (work still to do) or `DONE`.
- `completed_at` — timestamp set when the entry is marked done.

Open entries with past due dates surface automatically in the Overdue
view and the Open Work page's due-date buckets.

### Entry Value

Stores the value entered for a particular field of a particular
logbook entry.

This allows different projects to have different entry structures.

### Password Reset

Stores a password-reset request for a user. Each record contains a
unique, time-limited token sent to the user's email, and an
`expires_at` timestamp so that reset links become invalid after a
short period. Tokens are single-use: all of a user's reset records are
deleted in the same transaction that updates the password. Only a
SHA-256 digest of the token is stored, never the token itself. This
supports the **US00.3 – Reset Password** user story defined in the
Development Plan.

### Automation Rule

US26. A rule that watches one project's entries and applies an action —
add a tag, remove a tag, or set the entry's status — when its conditions
hold. Rules are evaluated when an entry is captured or updated, after
the save commits, so a broken rule can never cost the user their work.

`conditions` and `action` are stored as **JSONB** rather than normalised
tables: a rule is read whole, written whole, and never queried by its
parts, so splitting it would add joins without adding a query. `user_id`
sits alongside `project_id` (as it does for `custom_statistics`) — it is
redundant, since a project has one owner, but it keeps ownership checks
single-column. The `@@index(project_id, enabled)` is the only index an
entry save needs: the runner reads a project's enabled rules and
evaluates them in memory against the entry it just loaded. See the
"Automation Rules" section of the [API reference](../api-reference.md)
for the rule language and its deliberate limitations.

## Schema Changes Over Time

### How changes are applied

The schema is managed with **Prisma Migrate**. On 2026-09-27 the accumulated
migration history was squashed into a single baseline,
`prisma/migrations/0_init/migration.sql`, generated with
`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
and verified to reproduce the live schema exactly (a drift diff reports no
differences, and deploying it to an empty database creates every table).
`npx prisma migrate deploy` therefore bootstraps a fresh environment
end-to-end. New schema changes are made by editing `schema.prisma` and
running `npx prisma migrate dev --name <change>`, which adds a dated
migration on top of the baseline. The incremental migrations that the
baseline replaced remain visible in the git history.

### Deployment

The database is a managed **PostgreSQL instance hosted on [Neon](https://neon.tech)**
(serverless, autoscaling). The backend connects with Prisma's driver
adapter using the `DATABASE_URL` environment variable; connection
strings never leave the environment configuration.

### Change history

| Change | Sprint | Tables affected |
|---|---|---|
| Initial schema (users, projects, entry fields, entries, entry values, password resets) | 1 | all |
| Email verification + 2FA columns | 1 | `users` |
| Rich field types, `formula`, `archived_at` | 2 | `entry_fields` |
| Entry format versioning (`entry_format_versions`, `format_version_id`) | 2 | new table + `logbook_entries` |
| Entry status tracking (`status`, `completed_at`) | 2 | `logbook_entries` |
| Tags (`tags`, `project_tags`, `entry_tags`) | 2 | new tables |
| Entry versions and archive (`entry_versions`, `archived_at`) | 2 | new table + `logbook_entries` |
| Custom statistics | 2 | new table |
| Reminders (`reminders`, `reminder_settings`) | 2 | new tables |
| Recurring entries (`recurrence_rules`, `recurrence_rule_id`) | 2 | new table + `logbook_entries` |
| Auth hardening — `two_factor_recovery_codes`, SHA-256 token digests | 2 | new table + `password_resets`, `users` |
| Automation rules (`automation_rules`, `AutomationTrigger` enum) | 2 | new table + enum |
| Migration history squashed into the `0_init` baseline | 2 | `_prisma_migrations` |
| Web push for reminders (`push_subscriptions`, `reminders.pushed_at`) | 2 | new table + `reminders` |

The change-history rows above summarise work that arrived as eight dated
migrations and was folded into the baseline on 2026-09-27; each original
migration is still visible in the git history. The web-push row is the first
dated migration to land *on top of* the squashed baseline
(`20260927010000_push_notifications`), which is the workflow every later
schema change follows.

The authoritative source for the current schema is
`apps/backend/prisma/schema.prisma` in the repository.
