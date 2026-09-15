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

### 1.2 Reasoning & Motivation

* **Why Kanban instead of Scrum:** The project contains features with clear functional dependencies rather than work that must always be completed simultaneously within a fixed sprint. Kanban allows team members to progress their assigned functionality while making dependencies visible.

The core dependency chain established during Sprint 1 was:

$$
\text{Authentication}
\longrightarrow
\text{Projects}
\longrightarrow
\text{Entry Formats}
\longrightarrow
\text{Entries}
\longrightarrow
\text{Time Tracking / Browsing}
$$

The Intermediate phase builds on this foundation by extending entry formats and adding functionality that operates across existing logbook data:

$$
\text{Entry Formats}
\longrightarrow
\text{Rich Fields / Computed Fields}
\longrightarrow
\text{Statistics / Views}
\longrightarrow
\text{Offline / Data Portability}
$$

* **Functional Ownership:** Related stories are assigned to the same developer where possible. For example, US07–US10 are closely related because they all extend the entry-format system. Keeping these stories together allows one developer to maintain consistency between field definitions, format changes, versioning, and computed values.

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

### 2.3 Intermediate Completion Status

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

---

## 3. Retrospective

### 3.1 Sprint 1 – What Went Well

* **Vertical slice delivery:** All 10 core user stories from authentication through time tracking and entry browsing were implemented as end-to-end vertical slices covering the database, API, and UI.

* **Shared types package:** Extracting types into `@logbook/shared` eliminated duplication and helped identify type mismatches between the frontend and backend early.

* **Integration testing:** 27 Vitest tests running against the Neon database provided confidence that API endpoints worked correctly, including edge cases such as duplicate names, missing resources, and invalid input.

* **Prisma ORM adoption:** Migrating from raw SQL to Prisma simplified database access and provided type-safe queries.

* **Kanban workflow:** The dependency-chain model worked well with functional ownership and made dependencies between areas visible to the team.

### 3.2 Intermediate Phase – What Went Well

* **Feature ownership:** Grouping related Intermediate stories by functional area helped maintain consistency between related features.

* **Extension of the existing system:** The Intermediate features were developed on top of the Sprint 1 foundation rather than requiring a separate system.

* **Integration and testing:** Dedicated integration work helped identify issues occurring between independently developed features and ensured that the new functionality continued to work with existing features.

* **Flexible entry model:** Extending the entry-format system with richer fields and computed values moved the project closer to the specification's requirement for customisable logbook entries.

### 3.3 What Could Be Improved

* **Frontend error handling:** The frontend uses basic error banners for API failures. A proper toast notification system would improve the user experience.

* **Test isolation:** Integration tests run against the live database without transaction rollback. Tests create and clean up data, but parallel test runs could potentially conflict.

* **Documentation gaps:** Some documentation was written towards the end of development rather than incrementally. Future work should update documentation alongside implementation.

* **Cross-feature integration:** As more Intermediate features were introduced, dependencies between features became more complex. Earlier integration of completed components would reduce the risk of discovering compatibility issues near the end of development.

---

## 4. Remaining Improvements

Although the Intermediate user stories have been completed, several improvements identified from client feedback remain useful for further development:

1. Add frontend toast notifications for API errors.
2. Add unit tests alongside integration tests for complex business logic.
3. Add Calendar API integration where required.
4. Improve the visual presentation of overdue entries.
5. Add a live stopwatch widget to entry creation/editing.
6. Surface per-project cumulative time more prominently on the Project Detail page.
7. Improve notification and deadline-reminder functionality.

These items are treated as **future improvements rather than incomplete Intermediate user stories**.
