# Project Methodology & Work Tracker

## 1. Project Methodology

### 1.1 Methodology Used
We use a **Kanban-based methodology** with individual functional-area ownership, rather than a traditional fixed-length Scrum sprint model.

Each of the 10 user stories is assigned to one of four team members based on functional grouping:

| Team Member | User Stories | Functional Area |
| :--- | :--- | :--- |
| **Person 1** | US00.1, US00.2, US00.3, US00.4 | Authentication & Account Management |
| **Person 2** | US01, US05 | Project Management |
| **Person 3** | US02, US03 | Entry Structure & Entry Creation |
| **Person 4** | US04, US06 | Time Tracking & Entry Browsing |

Work flows through a single shared Kanban board with columns:  
`Backlog` $\rightarrow$ `To Do` $\rightarrow$ `In Progress` $\rightarrow$ `Done`.

Each team member manages the flow of their own stories independently rather than pulling from one shared prioritised backlog each sprint cycle.

### 1.2 Reasoning & Motivation
* **Why Kanban instead of Scrum:** The ten user stories do not compete for the same developer's time in a way that benefits from a shared sprint backlog. Instead, they form a clear dependency chain:
  $$\text{Authentication} \longrightarrow \text{Projects} \longrightarrow \text{Entry Formats} \longrightarrow \text{Entries} \longrightarrow \text{Time Tracking / Browsing}$$
* **Functional Ownership:** Stories like US02 (*Define Entry Format*) and US03 (*Record Entry*) are tightly coupled. Kanban with functional ownership allows one developer to design and build a coherent vertical slice end-to-end.
* **Handling Cross-Area Dependencies:** We use a `status:blocked-on-dependency` label. A story waiting on an upstream dependency (e.g., US04 waiting on US03's entry structure) remains in `Backlog` with this label applied. Once the upstream contract/schema is committed, the label is removed and the issue moves to `To Do`.

### 1.3 Evidence of Use
* All 10 user stories exist as Gitea issues assigned to owners, Sprint 1 milestone, and the Kanban board.
* Dependencies are recorded directly in issue descriptions using Gitea autolinking (e.g., `Depends on #7`).
* Commits and Pull Requests reference issue numbers (e.g., `closes #7`).

---

## 2. Work Tracker

### 2.1 Tool
We use Gitea's built-in **Issues, Labels, Milestones, and Projects (Kanban board)** features as our work tracker.

### 2.2 Board & Label Structure
* **Milestone:** `Sprint 1 – Core Logbook` groups all 10 user story issues.
* **Category Labels:**
  * Area: `area:auth`, `area:projects`, `area:entry-format`, `area:entries`, `area:time-browsing`
  * Priority: `priority:p1`, `priority:p2`, `priority:p3`
  * Dependency: `status:blocked-on-dependency`
* **Board Columns:**
  * `Backlog`: Story created, not yet startable or not yet picked up.
  * `To Do`: Ready to start; upstream dependencies resolved.
  * `In Progress`: Actively being implemented by assigned owner.
  * `Done`: Merged via PR, issue automatically closed via commit/PR reference.

### 2.3 Retrospective (Sprint End)

#### What Went Well

* **Vertical slice delivery:** All 10 user stories from authentication through time tracking and entry browsing were implemented as end-to-end vertical slices (database → API → UI).
* **Shared types package:** Extracting types into `@logbook/shared` eliminated duplication and caught type mismatches between frontend and backend early.
* **Integration testing:** 27 Vitest tests running against the live Neon database give confidence that API endpoints work correctly, including edge cases (409 duplicate names, 404 not found, invalid input).
* **Prisma ORM adoption:** Migrating from raw SQL to Prisma eliminated SQL injection risks, simplified migrations, and provided type-safe queries.
* **Kanban workflow:** The dependency-chain model (`Auth → Projects → Entry Format → Entries → Time/Browse`) worked well with functional ownership — no team member was blocked waiting on another's column.

#### What Could Be Improved

* **Frontend error handling:** The frontend uses basic error banners for API failures. A proper toast notification system would improve UX.
* **Test isolation:** Integration tests run against the live database without transaction rollback. Tests create and clean up data, but parallel test runs could conflict.
* **Documentation gaps:** Some documentation was only written at the end of Sprint 1 rather than incrementally. Future sprints should update docs alongside code changes.

#### Action Items for Sprint 2

1. ~~Implement JWT based authentication (replaces `x-user-id` header).~~ **Done** — JWT auth with email verification, password reset, and account deletion implemented in Sprint 1.
2. Add frontend toast notifications for API errors.
3. Consider adding unit tests alongside integration tests for complex business logic.
4. Add Calendar API integration (client-requested external API).