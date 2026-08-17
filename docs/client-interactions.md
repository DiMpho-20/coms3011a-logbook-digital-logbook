cat << 'EOF' > docs/client-interactions.md
# Client Interaction Logs

This document tracks requirements, Q&A, and decisions made in consultation with the client (lecturers/TAs). This serves as our project methodology evidence.

---

## [Date: 2026-08-13] - Project Process & Evidence Feedback
* **Channel:** In-class rubric review.
* **Feedback:** 
  * Google Form is not sufficient evidence for client interactions; team must provide documented logs.
  * Must document Kanban project methodology.
  * All supporting features must be functional in vertical slices.
* **Action Taken:** Adopted Gitea Kanban board, created client interactions documentation, established issue-to-branch workflow.

---

## [Date: 2026-08-17] - Requirements Clarification Meeting

* **Channel:** Requirements Review Meeting
* **Attendees:** Client / Lecturer, Development Team

### Confirmed Decisions & Architectural Impact

#### 1. Project Ownership & Naming
* **Client Decision:** A project is strictly owned by a single student. Project names must be unique for each student (e.g., a student cannot have two projects named "CS Lab 1").
* **Impact:** 
  * `projects` table uses `user_id UUID REFERENCES users(id) ON DELETE CASCADE`.
  * Add unique constraint: `UNIQUE(user_id, name)`.

#### 2. Project Archiving Behavior (US05)
* **Client Decision:** Archiving a project does not lock it into a read-only state. Users can still create new entries, edit/delete existing entries, and unarchive the project at any time.
* **Impact:** Archiving is a UI/filtering state (`status = 'archived'`) rather than a backend permission lock.

#### 3. Time Tracking, Live Timer & Overdue Flagging (US04)
* **Client Decision:** 
  * Time tracking on logbook entries is mandatory.
  * System must include a live timer feature for recording entry duration.
  * Entries/tasks must support flagging items as overdue.
* **Impact:** 
  * `entries` schema requires `duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0)`.
  * `entries` schema requires a target `due_date TIMESTAMP WITH TIME ZONE` to support overdue calculations.
  * Frontend UI needs a live stopwatch/timer widget that computes elapsed minutes.

#### 4. Entry Editing & Account Erasure
* **Client Decision:** Logbook entries can be edited and deleted after creation. When an account is deleted, all user data, projects, and entries must be permanently erased.
* **Impact:** Foreign keys must strictly enforce `ON DELETE CASCADE`.

#### 5. Stats, Analytics & External API Integration
* **Client Decision:** 
  * System must include project stats and analytics.
  * External API integration choice: Calendar API (e.g., syncing logbook deadlines/entries to an external calendar).
* **Impact:** 
  * Backend needs aggregate endpoints (e.g., `GET /api/projects/:id/stats`).
  * Design calendar sync service/export functionality for Sprint 2/3.

#### 6. Entry Timestamps & Backdating
* **Client Decision:** Left to engineering discretion.
* **Engineering Decision:** Include both `created_at` (system audit timestamp) and `entry_date` (user-customizable timestamp) on `entries`. This allows students to backdate work while maintaining audit records.
EOF