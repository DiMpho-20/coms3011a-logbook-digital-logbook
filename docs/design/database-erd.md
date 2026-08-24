# Database Design

## Entity Relationship Diagram

The Digital Logbook uses a PostgreSQL database to store users, projects,
project entry formats, and logbook entries.

```mermaid
erDiagram
    USER ||--o{ PROJECT : owns
    PROJECT ||--o{ ENTRY_FIELD : defines
    PROJECT ||--o{ LOGBOOK_ENTRY : contains
    LOGBOOK_ENTRY ||--o{ ENTRY_VALUE : has
    ENTRY_FIELD ||--o{ ENTRY_VALUE : defines

    USER {
        uuid id PK
        string name
        string email UK
        string password
    }

    PROJECT {
        uuid id PK
        uuid user_id FK
        string name
        string description
        string status
    }

    ENTRY_FIELD {
        uuid id PK
        uuid project_id FK
        string name
        string type
        boolean required
    }

    LOGBOOK_ENTRY {
        uuid id PK
        uuid project_id FK
        date entry_date
        int duration
        datetime created_at
    }

    ENTRY_VALUE {
        uuid id PK
        uuid entry_id FK
        uuid field_id FK
        string value
    }
```

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