# Database Design

## Entity Relationship Diagram

The Digital Logbook uses a PostgreSQL database to store users, projects,
project entry formats, and logbook entries.

```mermaid
erDiagram
    USER ||--o{ PROJECT : owns
    USER ||--o{ PASSWORD_RESET : requests
    PROJECT ||--o{ ENTRY_FIELD : defines
    PROJECT ||--o{ LOGBOOK_ENTRY : contains
    LOGBOOK_ENTRY ||--o{ ENTRY_VALUE : has
    ENTRY_FIELD ||--o{ ENTRY_VALUE : defines

    USER {
        uuid id PK
        string full_name
        string email UK
        string password_hash
        boolean is_email_verified
        string email_verification_token
        datetime email_verification_expiry
        string two_factor_secret
        boolean is_two_factor_enabled
        datetime scheduled_deletion_at
        datetime created_at
        datetime updated_at
    }

    PASSWORD_RESET {
        uuid id PK
        uuid user_id FK
        string token_hash
        datetime expires_at
        datetime created_at
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
        enum type "TEXT, NUMBER, DATE, BOOLEAN"
        boolean required
        datetime created_at
        datetime updated_at
    }

    LOGBOOK_ENTRY {
        uuid id PK
        uuid project_id FK
        int duration_minutes
        date entry_date
        date due_date
        datetime created_at
        datetime updated_at
    }

    ENTRY_VALUE {
        uuid id PK
        uuid entry_id FK
        uuid field_id FK
        text value
    }
```

### Constraints

- `USER.email` — Unique. Each email can only register once.
- `PROJECT(user_id, name)` — Unique. A student cannot have two projects with the same name.
- `ENTRY_VALUE(entry_id, field_id)` — Unique. One value per field per entry.
- All foreign keys use `ON DELETE CASCADE` for full account erasure.

## Main Entities

### User

Represents a student using the Digital Logbook.

A user can have multiple projects.

### Project

Represents a separate project belonging to a student.

A project can contain multiple entry fields and logbook entries.

### Entry Field

Defines the structure of a project's logbook entries.

For example, a project could define fields such as:

- Description
- Date
- Hours worked
- Task completed

Different projects can have different entry formats.

### Logbook Entry

Represents a recorded activity within a project.

An entry stores information such as the date it was recorded and the amount of
time spent.

### Entry Value

Stores the value entered for a particular field of a particular logbook entry.

This allows different projects to have different entry structures.