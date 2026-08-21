# Digital Logbook — Project Documentation

Welcome to the technical documentation for the **COMS3011A Digital Logbook** project.

## Quick Links

* **[Development Setup Guide](setup.md):** Local installation, Prisma setup, running dev servers, and testing.
* **[System Architecture](architecture.md):** Tech stack, monorepo layout, database ERD, API reference, and component architecture.
* **[Project Methodology & Work Tracker](methodology.md):** Kanban workflow, user story assignments, and Sprint 1 retrospective.
* **[Client Interaction Logs](client-interactions.md):** Requirements decisions and client meeting notes.
* **[Sprint 1 User Stories](user-stories/user-stories.md):** Acceptance criteria for all 10 user stories.

## Technical Stack Overview

| Layer | Technology |
|---|---|
| **Frontend** | React 19 + Vite 8 + TypeScript + Tailwind CSS |
| **Backend** | Express 5 + TypeScript + Zod validation |
| **Database** | PostgreSQL hosted on Neon, accessed via Prisma ORM 7 |
| **Shared** | `@logbook/shared` — TypeScript interfaces consumed by both frontend and backend |
| **Testing** | Vitest + Supertest (27 integration tests) |
| **Workspace** | Monorepo using npm workspaces |

## Sprint 1 Summary

Sprint 1 delivers the core logbook functionality with authentication and user management:

- **Authentication** — Registration, login, JWT tokens, email verification, password reset, and account deletion.
- **Project Management** — Create, edit, archive/unarchive projects with unique name enforcement per user.
- **Entry Schema Definition** — Define custom entry fields (TEXT, NUMBER, DATE, BOOLEAN) per project.
- **Entry CRUD** — Create, update, delete logbook entries with typed field values, due dates, and backdated entry dates.
- **Time Tracking** — Record duration per entry, view per-project time summaries (total hours, entry count, last entry).
- **Dashboard** — Overview cards showing active projects, entries this week, time this week, and total time.
- **Project Detail View** — View a single project's time summary, entry schema, and full entries list.
- **Entry Browser** — Cross-project entry search and filtering.
- **Profile Page** — Avatar upload, bio/slogan, degree, year, and student number with edit mode.
- **Settings** — Account management, dark/light theme, notification preferences, logbook preferences, and data export/import (JSON/CSV).
- **API Testing** — 27 Vitest integration tests covering all endpoints against the live database.
- **Responsive Design** — Tailwind CSS v4 design system with dark mode, collapsible sidebar, and mobile-friendly layout.
