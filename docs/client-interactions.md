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
* **Attendees:** Client / Lecturer, Development Team

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
