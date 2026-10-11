# Digital Logbook — Project Documentation

Welcome to the technical documentation for the **COMS3011A Digital Logbook** project.

## Quick Links

* **[Development Setup Guide](setup.md):** Local installation, environment variables, running dev servers, push notifications, and troubleshooting.
* **[System Architecture](architecture.md):** Deployment, tech stack, monorepo layout, data model, API areas, key flows, and security.
* **[API Reference](api-reference.md):** Every endpoint with its request and response shapes and errors.
* **[Project Methodology & Work Tracker](methodology.md):** Kanban workflow, story assignments for all three sprints, board status, and retrospectives.
* **[Client Interaction Logs](client-interactions.md):** Requirements decisions and client meeting notes.
* **[Testing](testing.md):** Automated test suite (stack, coverage, policy, proof of passing runs) and the formal user-feedback process.
* **[Testing Quickstart](testing-quickstart.md):** What to do when adding a feature: test file, running it, and the coverage rule.
* **[User Feedback](user-feedback.md):** SUS questionnaire, observation sheet, scoring setup, and the feedback-to-commit integration trail.
* **[Extra Features](extra-features/README.md):** Features beyond the user stories: the AI help assistant, My Grades and Google Calendar sync.
* **[Third-Party Code](third-party.md):** Every dependency and external service, with motivation for each choice.
* **[User Stories](user-stories/user-stories.md):** Acceptance tests for every Basic, Intermediate and Advanced user story.
* **[Architecture Design](design/architecture.md):** Layers, the sign-in flow, and the request pipeline.
* **[Database Design](design/database-erd.md):** Entity relationship diagrams for all twenty-three tables, constraints, indexes, and schema history.
* **[System Design](design/system-design.md):** The initial system design, and how it has evolved.
* **[Development Plan](design/development-plan.md):** Development phases, dependencies, testing strategy, and definition of done.
* **[Roadmap](design/roadmap.md):** Milestones, owners and status for every sprint.
* **[UI Design](design/ui-design.md):** Visual design specifications and mockups.

## Technical Stack Overview

| Layer | Technology |
|---|---|
| **Frontend** | React 19 + Vite 8 + TypeScript + Tailwind CSS v4 |
| **Backend** | Express 5 + TypeScript + Zod validation |
| **Database** | PostgreSQL hosted on Neon, accessed via Prisma ORM 7 |
| **Auth** | JWT + email verification + optional TOTP 2FA with recovery codes (`otplib` + `qrcode`) + rate limiting |
| **Email** | Resend (preferred) / Gmail SMTP via `nodemailer` (fallback) |
| **Notifications** | Web push (`web-push`) with a service worker |
| **Shared** | `@logbook/shared` — TypeScript interfaces and Zod schemas consumed by both frontend and backend |
| **Testing** | Vitest + Supertest (backend), Vitest + Testing Library (frontend) — see [Testing](testing.md) |
| **Linting** | oxlint (frontend) / ESLint + TypeScript type checker (backend) |
| **Workspace** | Monorepo using npm workspaces |

## Sprint 1 Summary

Sprint 1 delivers the core logbook functionality with authentication and user management:

- **Authentication** — Registration, login, JWT tokens, email verification, password reset, and account deletion.
- **Two-Factor Authentication** — TOTP-based 2FA with QR code setup, enable/disable flow in Settings.
- **Project Management** — Create, edit, archive/unarchive projects with unique name enforcement per user.
- **Entry Schema Definition** — Define custom entry fields (TEXT, NUMBER, DATE, BOOLEAN) per project.
- **Entry CRUD** — Create, update, delete logbook entries with typed field values, due dates, and backdated entry dates.
- **Time Tracking** — Record duration per entry, view per-project time summaries (total hours, entry count, last entry).
- **Project Detail View** — Entry format section (required/optional indicators), grouped entries by date, clean modal form for entry creation.
- **Entry Browser** — Vertical timeline layout with date grouping, search, project filter, entry type filter (All/This Week/Overdue), and newest/oldest sort toggle.
- **Overdue Entries** — Entries past `due_date` flagged with red border, warning badge, and dedicated Overdue filter tab.
- **Profile Page** — Avatar upload, bio/slogan, degree, year, and student number with edit mode.
- **Settings** — Account management, 2FA setup, dark/light theme, notification preferences, logbook preferences, and data export/import (JSON/CSV).
- **Auth UI** — Full-screen animated canvas background with floating particles, light streaks, and logbook icons. Frosted-glass form cards.
- **API Testing** — 27 Vitest integration tests covering all endpoints against the live database.
- **Responsive Design** — Tailwind CSS v4 design system with dark mode, collapsible sidebar, and mobile-friendly layout.


## Sprint 2 Summary

Sprint 2 builds on the Sprint 1 foundation (authentication, project management, entry CRUD, dashboard, and settings) with richer entry formatting, deeper analytics, offline support, and cross-feature integration.

- **Rich Field Types** — Support for tags, checklists, links, and references as entry field types, extending the original TEXT/NUMBER/DATE/BOOLEAN set.
- **Entry Format Editing** — Add, remove, and rename fields on an existing project's entry format after creation.
- **Entry Format Versioning** — Preserve previous versions of an entry format so historical entries remain valid and readable after schema changes.
- **Computed Fields** — Define fields whose values are calculated automatically from other fields in the same entry.
- **Custom Field Analytics** — Totals, grouping, comparisons, and plotting/visualization of data captured in custom fields.
- **Alternative Views** — Calendar view and board (kanban-style) view for browsing entries beyond the existing timeline layout.
- **Unfinished Work & Due Date Tracking** — Dedicated tracking for outstanding/unfinished entries and their due dates, building on Sprint 1's overdue flagging.
- **Offline Entry Capture** — Create and save entries locally without a connection, with sync to the server once back online.
- **Data Export & Import (Extended)** — Expanded export/import functionality for logbook data, building on Sprint 1's JSON/CSV support.
- **Cross-Feature Integration & Testing** — Integration of all Sprint 2 features into a cohesive whole, end-to-end testing across features, resolution of cross-feature bugs, and regression testing against Sprint 1 functionality.

## Sprint 2 Ownership

| Area | Owner | User Stories |
|---|---|---|
| Entry Formats & Fields | Person 1 | US07 – Rich Field Types, US08 – Modify Entry Format, US09 – Preserve Format Versions, US10 – Computed Fields |
| Statistics & Views | Person 2 | US11 – Analyse Custom Fields, US12 – Alternative Views, US13 – Track Unfinished Work & Due Dates |
| Offline & Data | Person 3 | US14 – Capture Entries Offline, US15 – Export & Import Logbook Data |
| Integration & Testing | Person 4 | Integration of all features, cross-feature testing, bug fixing, regression testing against Sprint 1, floating support to whichever area needs it |

## Sprint 3 Summary

Sprint 3 delivers the Advanced logbook: computing over data whose shape only its owner knows, a record that is hard to lose, a logbook that does some of the writing itself, and staying quick as the record grows. Stories are numbered as on the Sprint 3 board.

- **Custom Expressions & Saved Statistics** (US22, US23) — Write an expression such as `SUM({Hours}) / COUNT()` over your own entries and save it beside the built-in statistics.
- **Entry Automation Rules** (US24) — Rules that add or remove tags or set the status when an entry is created or saved.
- **Custom Dashboard** (US25, US26) — Choose and arrange statistics and information panels, including saved statistics; the layout is stored on the server, so it is the same on every device.
- **Recurring Entries** (US27) — Entries that repeat daily, weekly or monthly.
- **Automatic Reminders** (US28) — Reminders for upcoming and overdue due dates, stalled entries and daily logging, delivered as push notifications even with the logbook closed.
- **Entry Version History** (US29–US31) — Every change is kept; view an entry as it was on any date, and restore an earlier version.
- **Archiving & Performance** (US32, US33) — Archive old entries out of the way; database indexes, a paginated Entries page and one request for open work.
- **Advanced Search** (US35–US37) — Searching inside custom fields, combining filters and ranking results by relevance.

## Sprint 3 Ownership

| Area | Owner | User Stories |
|---|---|---|
| Custom Statistics & Expressions | Member 1 | US22 – Define Custom Expressions, US23 – Save Custom Statistics, US24 – Entry Automation Rules |
| Personal Dashboard & Automation | Member 2 | US25 – Create a Custom Dashboard, US26 – Arrange and Persist Dashboard Layout, US27 – Create Recurring Entries, US28 – Generate Automatic Reminders |
| Versioning & Record History | Member 3 | US29 – Preserve Entry Version History, US30 – View an Entry as It Existed on a Given Date, US31 – Restore a Previous Entry Version, US32 – Archive Old Entries |
| Advanced Search & Performance | Member 4 | US33 – Maintain Query Performance, US34 – Apply Rules When Capturing Entries, US35 – Rank Search Results, US36 – Combine Search Filters, US37 – Search Custom Fields |
