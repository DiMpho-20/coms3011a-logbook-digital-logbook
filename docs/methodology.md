# Project Methodology & Work Tracker

## 1. Project Methodology

### 1.1 Methodology Used
We use a **Kanban-based methodology** with individual functional-area ownership, rather than a traditional fixed-length Scrum sprint model.

Each of the 10 user stories is assigned to one of four team members based on functional grouping:

| Team Member | User Stories | Functional Area |
| :--- | :--- | :--- |
| **Person 1** | US00.1, US00.2, US00.3, US00.4 | Authentication & Account Management[cite: 1] |
| **Person 2** | US01, US05 | Project Management[cite: 1] |
| **Person 3** | US02, US03 | Entry Structure & Entry Creation[cite: 1] |
| **Person 4** | US04, US06 | Time Tracking & Entry Browsing[cite: 1] |

Work flows through a single shared Kanban board with columns:  
`Backlog` $\rightarrow$ `To Do` $\rightarrow$ `In Progress` $\rightarrow$ `Done`[cite: 1].

Each team member manages the flow of their own stories independently rather than pulling from one shared prioritised backlog each sprint cycle[cite: 1].

### 1.2 Reasoning & Motivation
* **Why Kanban instead of Scrum:** The ten user stories do not compete for the same developer's time in a way that benefits from a shared sprint backlog[cite: 1]. Instead, they form a clear dependency chain[cite: 1]:
  $$\text{Authentication} \longrightarrow \text{Projects} \longrightarrow \text{Entry Formats} \longrightarrow \text{Entries} \longrightarrow \text{Time Tracking / Browsing}$$
* **Functional Ownership:** Stories like US02 (*Define Entry Format*) and US03 (*Record Entry*) are tightly coupled[cite: 1]. Kanban with functional ownership allows one developer to design and build a coherent vertical slice end-to-end[cite: 1].
* **Handling Cross-Area Dependencies:** We use a `status:blocked-on-dependency` label[cite: 1]. A story waiting on an upstream dependency (e.g., US04 waiting on US03's entry structure) remains in `Backlog` with this label applied[cite: 1]. Once the upstream contract/schema is committed, the label is removed and the issue moves to `To Do`[cite: 1].

### 1.3 Evidence of Use
* All 10 user stories exist as Gitea issues assigned to owners, Sprint 1 milestone, and the Kanban board[cite: 1].
* Dependencies are recorded directly in issue descriptions using Gitea autolinking (e.g., `Depends on #7`)[cite: 1].
* Commits and Pull Requests reference issue numbers (e.g., `closes #7`)[cite: 1].

---

## 2. Work Tracker

### 2.1 Tool
We use Gitea's built-in **Issues, Labels, Milestones, and Projects (Kanban board)** features as our work tracker[cite: 1].

### 2.2 Board & Label Structure
* **Milestone:** `Sprint 1 – Core Logbook` groups all 10 user story issues[cite: 1].
* **Category Labels:**
  * Area: `area:auth`, `area:projects`, `area:entry-format`, `area:entries`, `area:time-browsing`[cite: 1]
  * Priority: `priority:p1`, `priority:p2`, `priority:p3`[cite: 1]
  * Dependency: `status:blocked-on-dependency`[cite: 1]
* **Board Columns:**
  * `Backlog`: Story created, not yet startable or not yet picked up[cite: 1].
  * `To Do`: Ready to start; upstream dependencies resolved[cite: 1].
  * `In Progress`: Actively being implemented by assigned owner[cite: 1].
  * `Done`: Merged via PR, issue automatically closed via commit/PR reference[cite: 1].

### 2.3 Retrospective (Sprint End)
*(To be completed at the conclusion of Sprint 1)*[cite: 1]