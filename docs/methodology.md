# Project Methodology & Work Tracker

## 1. Project Methodology

### 1.1 Methodology Used

We use a **Kanban-based methodology** with individual functional-area ownership rather than a traditional fixed-length Scrum sprint model.

The project is organised into functional areas, with user stories assigned to team members according to the relationships and dependencies between features.

For **Sprint 1 – Core Logbook**, the user stories were distributed as follows:

| Team Member  | User Stories                   | Functional Area                     |
| :----------- | :----------------------------- | :---------------------------------- |
| **Person 1** | US00.1, US00.2, US00.3, US00.4 | Authentication & Account Management |
| **Person 2** | US01, US05                     | Project Management                  |
| **Person 3** | US02, US03                     | Entry Structure & Entry Creation    |
| **Person 4** | US04, US06                     | Time Tracking & Entry Browsing      |

Work flows through a single shared Kanban board with columns:

`Backlog` → `To Do` → `In Progress` → `Done`

Each team member manages the flow of their assigned stories while coordinating with other members when cross-area dependencies arise.

For the **Intermediate phase**, work was divided into four functional areas:

| Team Member  | User Stories           | Functional Area           |
| :----------- | :--------------------- | :------------------------ |
| **Person 1** | US07, US08, US09, US10 | Entry Formats & Fields    |
| **Person 2** | US11, US12, US13       | Statistics & Views        |
| **Person 3** | US14, US15             | Offline & Data            |
| **Person 4** | Integration & Testing  | Cross-feature Integration |

For **Sprint 3 – Advanced Logbook**, work was again divided into four functional areas:

| Team Member  | User Stories                 | Functional Area                   |
| :----------- | :--------------------------- | :-------------------------------- |
| **Member 1** | US22, US23, US24             | Custom Statistics & Expressions   |
| **Member 2** | US25, US26, US27, US28       | Personal Dashboard & Automation   |
| **Member 3** | US29, US30, US31, US32       | Versioning & Record History       |
| **Member 4** | US33, US34, US35, US36, US37 | Advanced Search & Performance     |

### 1.2 Reasoning & Motivation

* **Why Kanban instead of Scrum:** The project contains features with clear functional dependencies rather than work that must always be completed simultaneously within a fixed sprint. Kanban allows team members to progress their assigned functionality while making dependencies visible.

The core dependency chain established during Sprint 1 was:

> **Authentication → Projects → Entry Formats → Entries → Time Tracking / Browsing**

The Intermediate phase builds on this foundation by extending entry formats and adding functionality that operates across existing logbook data:

> **Entry Formats → Rich Fields / Computed Fields → Statistics / Views → Offline / Data Portability**

Sprint 3 operates on data whose shape the platform does not know in advance, so each area builds on the custom-field and entry model from the earlier phases. Its dependency chains were:

> **Custom Fields → Custom Expressions → Saved Statistics → Dashboard Panels → Dashboard Persistence**

> **Entries → Version History → Historical Viewing → Restore Previous Version**

> **Entries & Due Dates → Automation Rules / Recurring Entries → Automatic Reminders → Device Notifications**

> **Custom Fields → Structured Search → Combined Filters → Result Ranking**

Saved statistics (US23) had to exist before they could be offered as dashboard panels (US25), and version history (US29) had to record every change before a past state could be viewed (US30) or restored (US31). Archiving (US32) and long-term query performance (US33) apply across all of the above.

* **Functional Ownership:** Related stories are assigned to the same developer where possible. For example, US07–US10 are closely related because they all extend the entry-format system, and US29–US31 all depend on the same version-history records. Keeping these stories together allows one developer to maintain consistency between related features.

* **Handling Cross-Area Dependencies:** We use a `status:blocked-on-dependency` label. A story waiting on an upstream dependency remains in `Backlog` with this label. Once the required contract, schema, or functionality is available, the label is removed and the issue can move to `To Do`.

### 1.3 Evidence of Use

For Sprint 1:

* All 10 core user stories were created as Gitea issues and assigned to owners.
* Stories were grouped under the `Sprint 1 – Core Logbook` milestone.
* Dependencies were recorded directly in issue descriptions using Gitea issue references.
* Commits and Pull Requests referenced issue numbers using references such as `closes #7`.
* Work was tracked through the Gitea Kanban board.

For the Intermediate phase:

* User stories US07–US15 were defined and assigned according to functional area.
* Intermediate work was tracked using the same Kanban-based workflow.
* Features were integrated with the existing Sprint 1 functionality rather than implemented as isolated components.
* Testing was performed across the new functionality and its interaction with the existing system.

For Sprint 3:

* All 16 user stories, US22–US37, were created as Gitea issues #94–#109.
* Stories were grouped under the `Sprint 3 - Advanced Logbook` milestone and tagged with one area label per functional area (see §2.2).
* Work was tracked on a Sprint 3 Kanban board with the same `Backlog` → `To Do` → `In Progress` → `Done` columns.
* Completed stories were delivered with automated tests: backend integration tests for the API and frontend tests for the interface.

---

## 2. Work Tracker

### 2.1 Tool

We use Gitea's built-in **Issues, Labels, Milestones, and Projects (Kanban board)** features as our work tracker.

### 2.2 Board & Label Structure

#### Sprint 1

**Milestone:**

`Sprint 1 – Core Logbook`

The milestone grouped the ten core user-story issues covering authentication, project management, entry formats, entry creation, time tracking, and entry browsing.

**Category Labels:**

* Area: `area:auth`, `area:projects`, `area:entry-format`, `area:entries`, `area:time-browsing`
* Priority: `priority:p1`, `priority:p2`, `priority:p3`
* Dependency: `status:blocked-on-dependency`

**Board Columns:**

* `Backlog`: Story created, not yet startable or not yet picked up.
* `To Do`: Ready to start; upstream dependencies resolved.
* `In Progress`: Actively being implemented by the assigned owner.
* `Done`: Merged through a Pull Request, with the issue closed through the relevant commit or PR reference.

#### Intermediate Phase

The Intermediate phase used the same Kanban workflow while extending the existing system.

**Person 1 – Entry Formats & Fields**

* **US07:** Add Rich Field Types — tags, checklists, links, and references.
* **US08:** Modify an Existing Entry Format — add, remove, and rename fields.
* **US09:** Preserve Previous Entry Format Versions.
* **US10:** Use Computed Fields — calculate values from other fields.

**Person 2 – Statistics & Views**

* **US11:** Analyse Custom Fields — total, group, compare, and plot data.
* **US12:** View Entries Using Alternative Views — calendar and boards.
* **US13:** Track Unfinished Work & Due Dates.

**Person 3 – Offline & Data**

* **US14:** Capture Entries Offline — save entries locally and synchronise later.
* **US15:** Export & Import Logbook Data.

**Person 4 – Integration & Testing**

Person 4 focused on:

* Integrating the features developed by the other team members.
* Testing the features individually and together.
* Fixing cross-feature integration issues.
* Ensuring compatibility with Sprint 1 functionality.
* Performing regression testing.
* Supporting other team members where additional integration or debugging work was required.

#### Sprint 3 – Advanced Logbook

**Milestone:**

`Sprint 3 - Advanced Logbook`

**Area Labels:**

* `area:custom-stats-and-expressions`
* `area:personal-dashboard-and-automation`
* `area:versioning-and-record-history`
* `area:advanced-search-and-performance`

**Board Columns:** the same `Backlog`, `To Do`, `In Progress` and `Done` columns as Sprint 1.

**Member 1 – Custom Statistics & Expressions**

* **US22 (#94):** Define Custom Expressions.
* **US23 (#95):** Save Custom Statistics.
* **US24 (#96):** Entry Automation Rules.

**Member 2 – Personal Dashboard & Automation**

* **US25 (#97):** Create a Custom Dashboard.
* **US26 (#98):** Arrange and Persist Dashboard Layout.
* **US27 (#99):** Create Recurring Entries.
* **US28 (#100):** Generate Automatic Reminders.

**Member 3 – Versioning & Record History**

* **US29 (#101):** Preserve Entry Version History.
* **US30 (#102):** View an Entry as It Existed on a Given Date.
* **US31 (#103):** Restore a Previous Entry Version.
* **US32 (#104):** Archive Old Entries.

**Member 4 – Advanced Search & Performance**

* **US33 (#105):** Maintain Query Performance for Large Logbooks.
* **US34 (#106):** Apply Rules When Capturing Entries.
* **US35 (#107):** Rank Search Results by Relevance.
* **US36 (#108):** Combine Search Filters.
* **US37 (#109):** Search Custom Fields.

### 2.3 Completion Status

#### Intermediate Phase

The Intermediate user stories **US07–US15 have been completed**.

The Intermediate phase extended the Basic Digital Logbook with:

* Richer field types.
* Modification of existing entry formats.
* Preservation of previous entry-format versions.
* Computed fields.
* Statistics based on custom fields.
* Alternative entry views.
* Unfinished-work and due-date tracking.
* Offline entry capture and synchronisation.
* Logbook data export and import.

These features were integrated with the Sprint 1 foundation so that the original project, entry, and logbook functionality continued to operate alongside the new Intermediate functionality.

#### Sprint 3 – Advanced Logbook

Status as shown on the Sprint 3 board:

| Area | Stories | Board column |
| :--- | :------ | :----------- |
| Custom Statistics & Expressions | US22, US23, US24 | Done |
| Personal Dashboard & Automation | US25, US26, US27, US28 | Done |
| Versioning & Record History | US29, US30, US31 | Done |
| Versioning & Record History | US32 | In Progress |
| Advanced Search & Performance | US33, US34, US35, US36, US37 | Backlog |

Ten of the sixteen stories are done. The completed stories added:

* Custom expressions over an owner's own entries, saved as statistics alongside the built-in ones.
* Automation rules evaluated when an entry is created or saved, which can add or remove tags and set status.
* A personal dashboard whose panels, including saved statistics, are chosen, arranged, and stored on the server.
* Recurring entries generated from a stored template on a daily, weekly, or monthly pattern.
* Automatic reminders for upcoming and overdue due dates, stalled entries, and a daily logging reminder, delivered as web push notifications when the logbook is closed.
* A version history for every entry, a view of an entry as it stood on a given date, and restoring an earlier version.

---

## 3. Retrospective

### 3.1 Sprint 1 – What Went Well

* **Vertical slice delivery:** All 10 core user stories from authentication through time tracking and entry browsing were implemented as end-to-end vertical slices covering the database, API, and UI.

* **Shared types package:** Extracting types into `@logbook/shared` eliminated duplication and helped identify type mismatches between the frontend and backend early.

* **Integration testing:** 27 Vitest tests running against the Neon database provided confidence that API endpoints worked correctly, including edge cases such as duplicate names, missing resources, and invalid input. The suite has since grown to 33 backend and 24 frontend test files.

* **Prisma ORM adoption:** Migrating from raw SQL to Prisma simplified database access and provided type-safe queries.

* **Kanban workflow:** The dependency-chain model worked well with functional ownership and made dependencies between areas visible to the team.

### 3.2 Intermediate Phase – What Went Well

* **Feature ownership:** Grouping related Intermediate stories by functional area helped maintain consistency between related features.

* **Extension of the existing system:** The Intermediate features were developed on top of the Sprint 1 foundation rather than requiring a separate system.

* **Integration and testing:** Dedicated integration work helped identify issues occurring between independently developed features and ensured that the new functionality continued to work with existing features.

* **Flexible entry model:** Extending the entry-format system with richer fields and computed values moved the project closer to the specification's requirement for customisable logbook entries.

### 3.3 Sprint 3 – What Went Well

> **TODO (team):** draft points to be reviewed

* **Building on stored history:** Because every save writes a version record, later features could rely on it. Automation rules record what they changed as their own version, so an automatic change can be seen and undone like a manual one.

* **Safe automation:** Automation rules run only after an entry has been saved, cannot trigger themselves or each other, and skip a broken rule rather than failing the save, so a misconfigured rule never costs the user their entry.

* **Server-side persistence:** Saving the dashboard layout on the server rather than in the browser means a student sees the same dashboard on every device.

### 3.4 What Could Be Improved

* **Frontend error handling:** The frontend uses basic error banners for API failures. A proper toast notification system would improve the user experience. Some failures are also reported misleadingly: when the backend cannot be reached, the login page reports "Invalid email or password."

* **Test isolation:** Integration tests run against the live database without transaction rollback. Tests create and clean up data, but parallel test runs could potentially conflict.

* **Documentation gaps:** Some documentation was written towards the end of development rather than incrementally. Future work should update documentation alongside implementation.

* **Cross-feature integration:** As more Intermediate features were introduced, dependencies between features became more complex. Earlier integration of completed components would reduce the risk of discovering compatibility issues near the end of development.

* **Testing features that depend on deployment:** Push notifications only work in a production build, and the hosted backend sleeps when idle on Render's free tier. Features like these need a deployed test environment, not only local development.

---

## 4. Remaining Improvements

Several improvements identified from client feedback after the Intermediate phase have since been delivered:

* Unit tests now sit alongside integration tests for complex business logic, such as the expression evaluator and automation-rule conditions.
* Google Calendar integration.
* A live stopwatch in entry creation and editing.
* Per-project cumulative time on the Project Detail page.
* Deadline reminders with device notifications (US28).

Improvements that remain useful for further development:

1. Add frontend toast notifications for API errors, and distinguish "server unreachable" from "wrong credentials".
2. Improve the visual presentation of overdue entries.

These items are treated as **future improvements rather than incomplete user stories**.
