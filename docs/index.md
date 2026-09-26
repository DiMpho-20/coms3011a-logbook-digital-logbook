# Digital Logbook — Project Documentation

Welcome to the technical documentation for the **COMS3011A Digital Logbook** project.

## Quick Links

* **[Development Setup Guide](setup.md):** Local installation, Prisma setup, running dev servers, and testing.
* **[System Architecture](architecture.md):** Tech stack, monorepo layout, database ERD, API reference, component architecture, and 2FA.
* **[Project Methodology & Work Tracker](methodology.md):** Kanban workflow, user story assignments, and Sprint 1 retrospective.
* **[Client Interaction Logs](client-interactions.md):** Requirements decisions and client meeting notes.
* **[Testing](testing.md):** Automated test suite (stack, coverage, policy, proof of passing runs) and the formal user-feedback process.
* **[User Feedback](user-feedback.md):** SUS questionnaire, observation sheet, scoring setup, and the feedback-to-commit integration trail.
* **[Third-Party Code](third-party.md):** Every dependency and external service, with motivation for each choice.
* **[Sprint 1 User Stories](user-stories/user-stories.md):** Acceptance criteria for all 10 user stories.
* **[System Design](design/system-design.md):** High-level system design and component diagrams.
* **[Development Plan](design/development-plan.md):** Sprint planning, task breakdown, and delivery timeline.
* **[UI Design](design/ui-design.md):** Visual design specifications and mockups.

## Technical Stack Overview

| Layer | Technology |
|---|---|
| **Frontend** | React 19 + Vite 8 + TypeScript + Tailwind CSS v4 |
| **Backend** | Express 5 + TypeScript + Zod validation |
| **Database** | PostgreSQL hosted on Neon, accessed via Prisma ORM 7 |
| **Auth** | JWT + email verification + optional TOTP 2FA (`otplib` + `qrcode`) |
| **Email** | Gmail SMTP (`nodemailer`) / Resend (alternative provider) |
| **Shared** | `@logbook/shared` — TypeScript interfaces and Zod schemas consumed by both frontend and backend |
| **Testing** | Vitest + Supertest (78 integration tests) |
| **Linting** | oxlint (frontend) / TypeScript type checker (backend) |
| **Workspace** | Monorepo using npm workspaces |

## Sprint 1 Summary

Sprint 1 delivers the core logbook functionality with authentication and user management:

- **Authentication** — Registration, login, JWT tokens, email verification, password reset, and account deletion.
- **Two-Factor Authentication** — TOTP-based 2FA with QR code setup, enable/disable flow in Settings.
- **Project Management** — Create, edit, archive/unarchive projects with unique name enforcement per user.
- **Entry Schema Definition** — Define custom entry fields (TEXT, NUMBER, DATE, BOOLEAN) per project.
- **Entry CRUD** — Create, update, delete logbook entries with typed field values, due dates, and backdated entry dates.
- **Time Tracking** — Record duration per entry, view per-project time summaries (total hours, entry count, last entry).
- **Custom dashboard** — Students can choose which built-in statistics and information panels appear on their dashboard; the selected view is retained on the device.
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

