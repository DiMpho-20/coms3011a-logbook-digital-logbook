# Client Interaction Logs

This document tracks requirements, Q&A, and decisions made in consultation with the client (lecturers/TAs). This serves as our project methodology evidence.

---

## [Date: 2026-08-13] — Project Process & Evidence Feedback

* **Channel:** In-class rubric review.
* **Feedback:** 
  * Google Form is not sufficient evidence for client interactions; team must provide documented logs.
  * Must document Kanban project methodology.
  * All supporting features must be functional in vertical slices.
* **Action Taken:** Adopted Gitea Kanban board, created client interactions documentation, established issue-to-branch workflow.

---

## [Date: 2026-08-17] — Requirements Clarification Meeting

* **Channel:** Requirements Review Meeting
* **Attendees:** Client / Lecturer, Development Team (all of us)

### Confirmed Decisions & Architectural Impact

#### 1. Project Ownership & Naming

* **Client Decision:** A project is strictly owned by a single student. Project names must be unique for each student (e.g., a student cannot have two projects named "CS Lab 1").
* **Impact:** 
  * `projects` table uses `user_id UUID REFERENCES users(id) ON DELETE CASCADE`.
  * Unique constraint: `UNIQUE(user_id, name)`.

#### 2. Project Archiving Behavior (US05)

* **Client Decision:** Archiving a project does not lock it into a read-only state. Users can still create new entries, edit/delete existing entries, and unarchive the project at any time.
* **Impact:** Archiving is a UI/filtering state (`status = 'ARCHIVED'`) rather than a backend permission lock. Implemented via `PATCH /api/projects/:id/status`.

#### 3. Time Tracking, Live Timer & Overdue Flagging (US04)

* **Client Decision:** 
  * Time tracking on logbook entries is mandatory.
  * System must include a live timer feature for recording entry duration.
  * Entries/tasks must support flagging items as overdue.
* **Impact:** 
  * `logbook_entries` schema requires `duration_minutes INTEGER NOT NULL DEFAULT 0`.
  * `logbook_entries` schema requires `due_date TIMESTAMP` to support overdue calculations.
  * `logbook_entries` schema includes `entry_date TIMESTAMP` for backdating.
  * Frontend UI needs a live stopwatch/timer widget that computes elapsed minutes.

#### 4. Entry Editing & Account Erasure

* **Client Decision:** Logbook entries can be edited and deleted after creation. When an account is deleted, all user data, projects, and entries must be permanently erased.
* **Impact:** All foreign keys enforce `ON DELETE CASCADE`. Verified in Prisma schema.

#### 5. Stats, Analytics & External API Integration

* **Client Decision:** 
  * System must include project stats and analytics.
  * External API integration choice: Calendar API (e.g., syncing logbook deadlines/entries to an external calendar).
* **Impact:** 
  * Backend provides `GET /api/projects/:id/time-summary` for per-project aggregates.
  * Dashboard view shows cross-project stats (entries this week, time this week, total time).
  * Calendar sync service designed for Sprint 2/3.

#### 6. Entry Timestamps & Backdating

* **Client Decision:** Left to engineering discretion.
* **Engineering Decision:** Include both `created_at` (system audit timestamp) and `entry_date` (user-customisable timestamp) on entries. This allows students to backdate work while maintaining audit records.

---

## [Date: 2026-08-21] — Sprint Review & Rubric Compliance Check

* **Channel:** In-person sprint review meeting with client/lecturer.
* **Attendees:** Client / Lecturer, Development Team (Dineo Motloung, Athandwa,Alondwe and Wendy )

### Meeting Context

The client conducted a thorough review of the project against the assessment rubric, checking implementation status of all required features. The team presented the current state of the application, including authentication, project management, entry CRUD, time tracking, dashboard, profile, and settings.

### Topics Discussed & Decisions

#### 1. Authentication — Confirmed as Core Requirement

* **Discussion:** The client confirmed that authentication (user registration, login, email verification, and password reset) is an **explicit rubric requirement** and must not be treated as optional or deferred.
* **Status:** Fully implemented — JWT-based auth with registration, login, email verification, password reset (forgot/reset flow), and account deletion. Dev-mode auto-verify is in place for development environments without SMTP credentials.
* **Client Feedback:** Satisfied with implementation. Noted that temporary dev-mode auto-verify is acceptable for development but production deployment must enforce real email verification.

#### 2. Due Dates & Overdue Flagging — Non-Negotiable

* **Discussion:** The client **reconfirmed** (originally stated 2026-08-17) that due dates and overdue flagging are **mandatory requirements** that must not be postponed. These are not optional features.
* **Decisions:**
  * Every logbook entry must support a `due_date` field.
  * Entries past their due date must be **automatically flagged as overdue** — no manual action required.
  * The UI must include a dedicated **Overdue tab/section** (alongside "All Entries" and "This Week") where overdue entries are surfaced automatically.
  * Overdue entries must be visually distinguished (e.g., red badge, warning icon) to draw immediate attention.
* **Impact:**
  * `logbook_entries.due_date` is already in the Prisma schema.
  * Frontend must compute overdue status: `entry.dueDate < now && entry.status !== 'completed'`.
  * Entries page and Project Detail page must include an "Overdue" filter/tab.
  * Dashboard should surface a count of overdue entries in the stats area.

#### 3. Live Timer / Stopwatch for Time Tracking

* **Discussion:** The client emphasized that time tracking must go beyond manual duration input. A **live stopwatch** feature is required.
* **Decisions:**
  * The entry creation/edit form must include a **live stopwatch widget** (start/stop/reset) that counts elapsed time in real-time.
  * The stopwatch measures minutes:seconds and converts to minutes when saved.
  * The stopwatch is a **count-up timer** (not a countdown), measuring actual time spent working.
  * Users can still manually enter duration if they prefer not to use the stopwatch.
* **Impact:**
  * Frontend component needed: a `Stopwatch` or `Timer` widget with start/pause/reset controls.
  * Timer state persisted to `sessionStorage` to survive accidental page refreshes.
  * Backend `duration_minutes` field already exists — no schema change needed.

#### 4. Overdue Reminders & Notifications

* **Discussion:** The client asked about reminder capabilities for approaching deadlines.
* **Decisions:**
  * The system should provide **advance reminders** — e.g., 3 days before a due date, 1 day before, and on the due date itself.
  * Reminders can be displayed as in-app notifications (toast or notification bell) rather than requiring email delivery for Sprint 1.
  * This aligns with the existing Settings > Notifications section.
* **Impact:**
  * Frontend needs a notification indicator (badge count or bell icon in sidebar/header).
  * Backend may need a lightweight `notifications` table or a computed approach (query entries where `due_date` is within N days).

#### 5. Calendar API Integration (External API)

* **Discussion:** The client reconfirmed the requirement for an **external API integration**, and the team proposed Calendar API sync as the most natural fit for a logbook application.
* **Decisions:**
  * Due dates from logbook entries should be exportable to **Google Calendar** (or similar) via the Google Calendar API.
  * Users should be able to sync entry due dates as calendar events with reminders.
  * Implementation planned for Sprint 2 — the data model (`due_date` on entries) already supports this.
* **Impact:**
  * Will require Google Calendar API OAuth2 integration.
  * A "Sync to Calendar" button on the project detail or entry page.
  * Backend endpoint: `POST /api/projects/:id/sync-calendar` to push due dates.

#### 6. Per-Project Time Recording with Stopwatch

* **Discussion:** Beyond per-entry time tracking, the client asked about recording **total time spent on each project**.
* **Decisions:**
  * Per-project total time is computed as the sum of all entry durations — already implemented via `GET /api/projects/:id/time-summary`.
  * The live stopwatch on the entry form captures time per entry, which rolls up to project totals automatically.
  * The project detail page should display the cumulative time prominently.
* **Impact:** No schema change needed. Frontend needs to surface time summary more prominently in the project detail view.

#### 7. Rubric Compliance Check

* **Client reviewed the following rubric areas:**
  * **Authentication & user management** — Implemented (register, login, verify email, reset password, delete account).
  * **Project CRUD** — Implemented (create, read, update, archive/unarchive, unique name enforcement).
  * **Customisable entry formats** — Implemented (TEXT, NUMBER, DATE, BOOLEAN field types per project).
  * **Entry CRUD with time tracking** — Implemented (create, update, delete entries with duration and due dates).
  * **Dashboard & statistics** — Implemented (stat cards, recent entries, time summaries).
  * **Data export/import** — Implemented in Settings (JSON/CSV export, JSON import).
  * **Dark mode / theme** — Implemented (light/dark/system theme with accent colour).
  * **Development setup guide** — Implemented and up to date.
  * **Testing** — 27 integration tests passing.
  * **Methodology documentation** — Kanban board, user stories, retrospectives documented.

* **Items noted as remaining:**
  * Live stopwatch widget on entry form — **Implemented on feature branch (Dineo), not yet merged to main or deployed.**
  * In-app deadline reminders (3 days, 1 day, day-of) — **Implemented on feature branch (Dineo), not yet merged to main or deployed.**
  * Notification indicator (bell badge) in sidebar — **Implemented on feature branch (Dineo), not yet merged to main or deployed.**
  * Calendar API integration (planned for Sprint 2).

### Action Items from This Meeting

| # | Action | Priority | Status |
|---|--------|----------|--------|
| 1 | Implement Overdue tab in Entries page (auto-flag overdue entries) | P1 | **Done** |
| 2 | Add live stopwatch widget to entry creation/edit form | P1 | **Done** |
| 3 | Add overdue entry count to Dashboard stats | P1 | **Done** |
| 4 | Implement in-app deadline reminders (3 days, 1 day, day-of) | P2 | **Done** |
| 5 | Add notification indicator (bell icon or badge) to UI | P2 | **Done** |
| 6 | Google Calendar API integration for due date sync | P2 | Sprint 2 |
| 7 | Visual distinction for overdue entries (red badge/warning) | P1 | **Done** |

### Known Shortcomings

The following features have been developed but are not yet present in the deployed application (`coms3011a-logbook.pages.dev`). They exist on the **Dineo** feature branch and are pending review before merging to `main`.

| # | Feature | Status | Reason Not Deployed |
|---|---------|--------|---------------------|
| 1 | Live stopwatch widget on entry forms | Code complete | Awaiting branch review and merge |
| 2 | Deadline reminders panel on Dashboard | Code complete | Awaiting branch review and merge |
| 3 | Notification bell badge in sidebar | Code complete | Awaiting branch review and merge |
| 4 | Google Calendar integration | Not started | Planned for Sprint 2 — requires OAuth2 setup |

Additionally, the following limitations apply to the current deployed release:

* **No external API integration** — Calendar sync (Google Calendar) is deferred to Sprint 2 as it requires Google Cloud Console setup and OAuth2 consent flow.
* **Documentation site not yet deployed** — MkDocs configuration is complete; a team member is handling deployment to Cloudflare Pages.
* **Accessibility** — Basic semantic HTML is used throughout, but full WCAG 2.1 compliance (ARIA labels, keyboard navigation audit, screen reader testing) is planned for a later sprint.
