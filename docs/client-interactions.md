# Client Interaction Logs

This document tracks requirements, Q&A, and decisions made in consultation with the client (lecturers/TAs). It serves as project methodology evidence and records how client feedback influenced the development of the Digital Logbook.

---

## [Date: 2026-08-13] — Project Process & Evidence Feedback

* **Channel:** In-class rubric review.

* **Feedback:**

  * Google Form is not sufficient evidence for client interactions; the team must provide documented logs.
  * The team must document its Kanban project methodology.
  * All supporting features must be functional in vertical slices.

* **Action Taken:**

  * Adopted the Gitea Kanban board as the project work-tracking system.
  * Created client interaction documentation.
  * Established an issue-to-branch workflow.
  * Continued developing functionality as vertical slices across the database, API, and frontend.

---

## [Date: 2026-08-17] — Requirements Clarification Meeting

* **Channel:** Requirements Review Meeting.

* **Attendees:** Client / Lecturer, Development Team (all members).

### Confirmed Decisions & Architectural Impact

#### 1. Project Ownership & Naming

* **Client Decision:** A project is strictly owned by a single student. Project names must be unique for each student (e.g., a student cannot have two projects named "CS Lab 1").

* **Impact:**

  * `projects` table uses `user_id UUID REFERENCES users(id) ON DELETE CASCADE`.
  * Unique constraint: `UNIQUE(user_id, name)`.

#### 2. Project Archiving Behavior (US05)

* **Client Decision:** Archiving a project does not lock it into a read-only state. Users can still create new entries, edit/delete existing entries, and unarchive the project at any time.

* **Impact:** Archiving is implemented as a UI/filtering state (`status = 'ARCHIVED'`) rather than a backend permission lock. This is handled through `PATCH /api/projects/:id/status`.

#### 3. Time Tracking, Live Timer & Overdue Flagging (US04)

* **Client Decision:**

  * Time tracking on logbook entries is mandatory.
  * The system must include a live timer feature for recording entry duration.
  * Entries/tasks must support flagging items as overdue.

* **Impact:**

  * `logbook_entries` requires `duration_minutes INTEGER NOT NULL DEFAULT 0`.
  * `logbook_entries` includes `due_date TIMESTAMP` to support overdue calculations.
  * `logbook_entries` includes `entry_date TIMESTAMP` to support backdating.
  * The frontend requires a live stopwatch/timer widget that calculates elapsed time.

#### 4. Entry Editing & Account Erasure

* **Client Decision:** Logbook entries can be edited and deleted after creation. When an account is deleted, all user data, projects, and entries must be permanently erased.

* **Impact:** Foreign keys enforce `ON DELETE CASCADE` where appropriate. This behaviour was verified in the Prisma schema.

#### 5. Stats, Analytics & External API Integration

* **Client Decision:**

  * The system must include project statistics and analytics.
  * The external API integration should use a Calendar API, such as syncing logbook deadlines or entries to an external calendar.

* **Impact:**

  * Backend provides `GET /api/projects/:id/time-summary` for per-project time aggregates.
  * The Dashboard provides cross-project statistics.
  * Calendar integration was identified as a future development requirement.

#### 6. Entry Timestamps & Backdating

* **Client Decision:** The handling of entry timestamps was left to engineering discretion.

* **Engineering Decision:** Include both `created_at` (system audit timestamp) and `entry_date` (user-customisable timestamp) on entries. This allows students to backdate work while maintaining an audit record.

---

## [Date: 2026-08-21] — Sprint Review & Rubric Compliance Check

* **Channel:** In-person sprint review meeting with client/lecturer.

* **Attendees:** Client / Lecturer, Development Team (Dineo Motloung, Athandwa, Alondwe and Wendy).

### Meeting Context

The client conducted a review of the project against the assessment rubric, checking the implementation status of the required features. The team presented the current state of the application, including authentication, project management, entry CRUD, time tracking, dashboard, profile, and settings.

### Topics Discussed & Decisions

#### 1. Authentication — Confirmed as Core Requirement

* **Discussion:** The client confirmed that authentication, including user registration, login, email verification, and password reset, is an explicit rubric requirement and must not be treated as optional or deferred.

* **Status:** Fully implemented — JWT-based authentication with registration, login, email verification, password reset, and account deletion.

* **Client Feedback:** The client was satisfied with the implementation. Temporary development-mode auto-verification was considered acceptable during development, but production deployment should enforce real email verification.

#### 2. Due Dates & Overdue Flagging — Non-Negotiable

* **Discussion:** The client reconfirmed that due dates and overdue flagging are mandatory requirements.

* **Decisions:**

  * Every logbook entry must support a `due_date` field.
  * Entries past their due date must be automatically identified as overdue.
  * The UI must provide an Overdue section/filter alongside other entry views.
  * Overdue entries must be visually distinguished.

* **Impact:**

  * `logbook_entries.due_date` is included in the Prisma schema.
  * Overdue status is determined using the entry due date and completion status.
  * The Entries and Project Detail views support overdue filtering.
  * The Dashboard includes overdue information.

#### 3. Live Timer / Stopwatch for Time Tracking

* **Discussion:** The client emphasised that time tracking should go beyond manually entering a duration. A live stopwatch feature was identified as a required improvement.

* **Decisions:**

  * The entry creation/edit form should include a live stopwatch.
  * The stopwatch should support start, pause, and reset.
  * The timer should measure elapsed time and convert it to the required duration value when saved.
  * Users should still be able to enter a duration manually.

* **Impact:**

  * A stopwatch component was developed for the entry form.
  * Timer state is persisted during the active session to reduce the risk of losing timing information.
  * The existing `duration_minutes` backend field supports the saved duration.

#### 4. Overdue Reminders & Notifications

* **Discussion:** The client asked about reminder capabilities for approaching deadlines.

* **Decisions:**

  * The system should support advance reminders, such as reminders three days before, one day before, and on the due date.
  * In-app notifications are sufficient for the current implementation.
  * Email notifications are not required for the initial implementation.

* **Impact:**

  * Deadline reminders were implemented in the application.
  * A notification indicator was added to provide users with visibility of notifications.
  * The existing due-date information is used to determine when reminders should be displayed.

#### 5. Calendar API Integration (External API)

* **Discussion:** The client reconfirmed the requirement for an external API integration. The team proposed Calendar API synchronisation as the most natural integration for a digital logbook.

* **Decisions:**

  * Logbook due dates should be exportable or synchronisable to an external calendar.
  * Google Calendar was identified as the preferred integration.
  * Calendar synchronisation was planned for a later development phase.

* **Impact:**

  * The existing `due_date` field provides the required data for calendar events.
  * Google Calendar API integration requires OAuth2 configuration and external service credentials.
  * This feature remains planned for future development.

#### 6. Per-Project Time Recording with Stopwatch

* **Discussion:** The client asked about recording the total amount of time spent on individual projects.

* **Decisions:**

  * Per-project total time should be calculated from the durations of the project's entries.
  * Time recorded using the stopwatch contributes to the relevant entry duration.
  * Project totals should be clearly visible to users.

* **Impact:**

  * The existing `GET /api/projects/:id/time-summary` endpoint provides project-level time aggregation.
  * The Project Detail page can use this information to display cumulative project time.

#### 7. Rubric Compliance Check

The client reviewed the following rubric areas:

* **Authentication & user management** — Implemented (registration, login, email verification, password reset, and account deletion).
* **Project CRUD** — Implemented (create, read, update, archive/unarchive, and unique name enforcement).
* **Customisable entry formats** — Implemented with project-specific field definitions.
* **Entry CRUD with time tracking** — Implemented with duration and due-date support.
* **Dashboard & statistics** — Implemented with statistics and time summaries.
* **Data export/import** — Implemented in Settings.
* **Dark mode / theme** — Implemented with light, dark, and system themes.
* **Development setup guide** — Implemented and maintained.
* **Testing** — Integration tests implemented and passing.
* **Methodology documentation** — Kanban board, user stories, and retrospective documentation maintained.

---

## 3. Intermediate Phase Client Interaction

### [Date: August–September 2026] — Intermediate Development Follow-Up

The Intermediate phase involved significantly fewer formal client interactions than Sprint 1.

Most of the requirements for the Intermediate functionality had already been clarified during the previous in-person client/lecturer meetings, particularly the requirements discussed during the Sprint 1 review. Therefore, the team was able to continue implementation using the confirmed requirements without requiring another formal requirements meeting.

### Communication Channel

* **Channel:** Team WhatsApp group used for occasional follow-up questions and clarification.

### Nature of Interaction

During the Intermediate phase, the team used the WhatsApp group to ask a small number of clarification questions when implementation details were unclear.

These interactions were primarily used to confirm interpretation of previously discussed requirements rather than introduce major new requirements.

The team therefore did not hold a separate formal client requirements meeting during this phase.

### Development Approach

The Intermediate user stories were implemented based on the requirements already established during the previous client meetings:

* **US07–US10:** Rich field types, editable entry formats, format version preservation, and computed fields.
* **US11–US13:** Custom-field statistics, alternative views, and unfinished-work/due-date functionality.
* **US14–US15:** Offline capture, synchronisation, and data export/import.
* **Integration & Testing:** Integration of the new functionality with the existing Basic features.

The team maintained the previously agreed Kanban methodology and continued using Gitea Issues, Projects, Labels, and Pull Requests to track implementation.

---

## 4. Intermediate Phase Outcomes

The Intermediate functionality was completed and integrated with the existing Basic Digital Logbook functionality.

The completed Intermediate functionality includes:

* Richer custom field types.
* Modification of existing entry formats.
* Preservation of previous entry-format versions.
* Computed fields.
* Statistics and analysis of custom fields.
* Alternative ways of viewing entries.
* Unfinished-work and due-date tracking.
* Offline entry capture and synchronisation.
* Data export and import.

The implementation was tested together with the existing Sprint 1 functionality to identify cross-feature issues and regression problems.

---

## 5. Documentation & Deployment Update

During the Intermediate phase, the project documentation was also prepared for online access.

The MkDocs documentation site was successfully deployed using **Netlify**. The deployed documentation provides an accessible version of the project's technical and project-management documentation without requiring users to access local files.

A link to the deployed MkDocs documentation was added to the project's `README.md` so that team members, lecturers, and other reviewers can access the documentation directly from the Gitea repository.

The documentation deployment therefore replaced the previous plan of using Cloudflare Pages.

---

## 6. Current Outstanding Work

The following items remain as future improvements or later-phase functionality rather than unresolved requirements from the completed Intermediate user stories:

| # | Feature                                                    | Status                    |
| - | ---------------------------------------------------------- | ------------------------- |
| 1 | Google Calendar API integration                            | Planned for a later phase |
| 2 | Further improvements to notification functionality         | Future improvement        |
| 3 | Further accessibility testing and WCAG improvements        | Future improvement        |
| 4 | Additional automated unit tests for complex business logic | Future improvement        |

The Intermediate user stories themselves have been completed and integrated into the project.

---

## [Date: 2026-09-18] — Client Meeting & Technical Feedback

* **Channel:** Client meeting.

* **Feedback:**

  * The application is currently slow, so the team should investigate changing the deployment platform and deploy the application using **Vercel**.
  * The team should use **MantisBT** as the bug-tracking system to formally document and manage reported bugs.
  * The dashboard currently contains statistics that may be unnecessary because the application already has a separate statistics feature accessible through the side navigation. The team should consider removing the statistics section from the dashboard to avoid duplication.
  * The database was reviewed and it was identified that the **tags table is missing**. This is affecting the functionality of tags and preventing logbook entries from being updated correctly.
  * The missing tags table may also be contributing to the application's performance issues. The team should investigate possible glitches or delays in communication between the frontend and backend.
  * The team must properly **document the internal APIs**, including the available endpoints and their purpose, as required by the project.
  * The team needs to set up **CI/CD** so that testing and code coverage can be automated rather than relying on manually running tests and checking the coverage results.

* **Action Taken / Planned Actions:**

  * Investigate and migrate the application deployment to **Vercel** to address the application's performance issues.
  * Set up **MantisBT** and use it as the team's formal bug-tracking system.
  * Remove the duplicated statistics section from the dashboard while keeping the dedicated statistics functionality accessible through the side navigation.
  * Add the missing **tags table** to the database and ensure that tags are correctly integrated with logbook entries.
  * Investigate and resolve possible frontend–backend communication glitches and performance issues.
  * Document the project's **internal APIs**, including endpoints, requests, responses, and their purpose.
  * Set up a **CI/CD pipeline** to automatically run tests and generate/check code coverage.
  * Continue documenting technical decisions and client feedback as project evidence.

---

## [Date: 2026-09-25] — Client Meeting & Feature Feedback

* **Channel:** Client meeting.

* **Feedback:**

  * The client suggested adding a **streak** feature to show users their consistency in creating logbook entries.
  * The application should show the **number of entries per month** so users can track their activity over time.
  * The client suggested adding **progress tracking** to the dashboard, allowing users to see the progress of their entries over time.
  * The client suggested **ranking tags**, such as showing the most-used tags and how many entries use each tag.
  * The client suggested allowing users to **compare different weeks** when viewing their statistics and progress.
  * Users should be given the **option to choose which statistics they want to see**, rather than having a fixed set of statistics.
  * The dashboard should give users more **freedom to customise what they want to see**, allowing them to select the information and statistics that are most relevant to them.
  * The client suggested adding **more filtering options** to make it easier for users to find and analyse their entries.
  * The client suggested an **auto-completion/auto-compilation feature** where repeatedly creating similar entries could automatically suggest or complete information based on previous entries.
  * The client suggested exploring **expressions/custom statistics**. The team will ask **Branden** for clarification on how expressions should work and what functionality is expected.
  * The first note regarding checking entries over a specified period was discussed as a possible consideration rather than a confirmed feature requirement.

* **Bug Tracking:**

  * The team discussed using **MantisBT** for bug tracking.
  * It was agreed **not to use MantisBT**, as the available workspace is shared and would not provide the team with a suitable dedicated space for managing the project's bugs.
  * The team instead created a **dedicated project in Gitea** that will be used as the project's bug tracker.
  * Bugs and issues will be recorded and managed within the Gitea project to keep the team's bug-tracking process centralised with the project repository.

* **Action Taken / Planned Actions:**

  * Add a **streak** feature to track user consistency.
  * Add **monthly entry counts** to the statistics/dashboard functionality.
  * Investigate adding **progress tracking** for entries over time.
  * Implement **tag ranking/usage statistics**, including most-used tags and the number of entries associated with each tag.
  * Add functionality to **compare statistics across different weeks**.
  * Allow users to **select the statistics** they want displayed.
  * Provide users with **customisable dashboard options** so they can choose what information is displayed.
  * Expand the available **entry filtering options**.
  * Investigate and design the **auto-completion/auto-compilation** feature for repeated or similar entries.
  * Ask **Branden** for clarification on the expected **expression/custom statistics** functionality.
  * Use the newly created **Gitea project as the project's bug tracker** instead of MantisBT.
  * Continue documenting client feedback and decisions as project evidence.

---

## 7. Summary

The majority of client requirements for the Intermediate phase were already established during the Sprint 1 client meetings. As a result, the team required only limited follow-up interaction during this phase.

Rather than creating artificial or unnecessary meetings, the team continued development using the requirements and architectural decisions previously confirmed by the client. Where clarification was required, questions were raised through the team's existing WhatsApp communication channel.

This approach allowed the team to continue development while maintaining a record of the decisions that informed the implementation.

The project documentation was also made accessible online through the deployed MkDocs site, with the documentation link included in the project README.
