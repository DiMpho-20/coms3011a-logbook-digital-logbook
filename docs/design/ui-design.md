# UI Design

## Design Goals

The Digital Logbook interface is designed to be:

* Simple and easy for students to navigate.
* Responsive across desktop, tablet, and mobile devices.
* Accessible and readable.
* Consistent across all pages.
* Focused on quickly recording and reviewing logbook entries.
* Flexible enough to support custom entry formats and different field types.
* Clear when displaying deadlines, overdue work, and unfinished entries.

## Visual Direction: Calm Clarity

The interface was redesigned in October 2026 around one principle: *a study
desk, not a dashboard*. Each page answers one question, and shows only what
that question needs:

| Page | Its question |
|---|---|
| Dashboard | What matters to me today? |
| Projects | What am I working on, and what has gone quiet? |
| Entries | What did I do? |
| Open Work | What unfinished work needs dealing with? |
| Board | How are this project's entries organised? |
| Calendar | What's coming, and what did I log, for one project? |
| Statistics | How am I spending my time? |
| My Grades | Where do I stand in each module, and what does the rest need? |
| Reminders | What needs my attention, and why am I being reminded? |
| Profile | Who am I, and what have I been working on? |

The visual language is shared across every page:

* White cards with thin borders on a soft neutral background, and restrained shadows.
* One accent colour, chosen by the student in Settings (blue, emerald, violet, amber or rose); every primary button, active state and highlight follows it.
* Strong but small typography, with tabular figures so numbers line up.
* Muted status colours. Red means only an error, a destructive action, or work that is genuinely overdue; status is always given in words and an icon as well as colour.
* Short transitions (150–200 ms) that the operating system's reduced-motion setting turns off.
* Light, dark and system themes, and a comfortable or compact density.

## Design Artifacts

The interface was designed using low-fidelity wireframes followed by a higher-fidelity mockup:

* 📄 [Wireframe](Logbook%20wireframe.pdf) — initial layout and navigation structure for each screen.
* 📄 [Mockup](DigitalLogbook%20mockup.pdf) — refined visual design based on the wireframe.

The implemented interface follows the overall structure established by these design artifacts while incorporating additional functionality introduced during the Intermediate and Advanced phases.

## Application Navigation

Authenticated users reach every main area from the sidebar:

```text
Sidebar (an inset dark panel, grouped)
├── Today
│   ├── Dashboard      what matters today, and the student's own panels
│   ├── Reminders      needs attention / upcoming / done, and reminder rules
│   └── Calendar       one project by month, Google Calendar sync
├── Work
│   ├── Projects ──► Project Detail
│   │                 ├── Entry Form
│   │                 ├── Entry Format
│   │                 ├── Entry History
│   │                 └── Automation Rules
│   ├── Entries        day by day, search, filters, saved filters, archive
│   ├── Open Work      overdue, coming up, no date yet
│   ├── Board          one project's entries in columns
│   └── Statistics     time, breakdown, over time, saved statistics
├── Academics
│   └── My Grades ──► Module page
└── Personal
    ├── Profile
    └── Settings       account, appearance, logbook, notifications, security, data
```

The current page is marked with an accent wash, accent text, a heavier icon and
an accent edge, so it never relies on colour alone. A count of due reminders
sits on Reminders, and Log out is beside the student's name. On phones the
sidebar becomes a slide-in drawer, and pressing **N** anywhere opens a quick
entry form. Offline capture works through the normal entry form.

## Main Screens

### 1. Landing Page

The landing page introduces the Digital Logbook and provides options to:

* Sign in.
* Create an account.

*See the [mockup](DigitalLogbook%20mockup.pdf) for the landing page layout.*

### 2. Sign In

The Sign In page allows an existing student to authenticate using their account credentials.

Authentication is integrated with the rest of the application so that authenticated functionality is protected from unauthorised access.

*See the [mockup](DigitalLogbook%20mockup.pdf) for the sign-in screen.*

### 3. Registration

The Registration page allows a new student to create an account.

The interface provides the required account fields and validation before an account is created.

*See the [mockup](DigitalLogbook%20mockup.pdf) for the registration screen.*

### 4. Dashboard

The Dashboard answers "what matters today?". From the top: a greeting with
**New project**; a short daily note; **Next up** (what is happening soon,
grouped by day) beside **On your radar** (a few things worth attention, with
the next step for each); **Modules at a glance** from My Grades; then the
student's own panels.

A new account sees a getting-started guide instead of a page of empty cards:
"Start with one thing you did today", with **Create your first project** and
**Import a backup**, then **Log your first entry** once a project exists.

The student's own panels include:

* Entry streak.
* Deadline reminders (upcoming and overdue work).
* Recent activity.
* Current projects.
* Progress over time.
* Entries per month.
* This week compared with last week.
* Tags and tag ranking.
* Recent entries.
* The student's own saved statistics.

Students pick panels from a panel picker and arrange them with "Arrange panels". The layout is saved to their account, so the dashboard looks the same on every device. The dashboard deliberately does not repeat the figures on the Statistics page.

### 5. Projects

The Projects page answers "what am I working on, and what has gone quiet?".
A toolbar holds search, Active / Archived / All and a grid or list layout.
Each project shows its status in words (**Active**, **Quiet** after two weeks
without an entry, or **Archived**), its entry count, time logged and last
activity ("today", "24 days ago"). Edit, archive and delete sit behind one
accessible **More actions** menu rather than a row of buttons.

Students can:

* Create a project.
* Open a project.
* Edit project information.
* Archive or unarchive a project.
* Delete a project, after a confirmation that offers archiving instead.

Projects remain accessible after being archived, allowing students to continue managing their project data when required.

### 6. Project Detail

The Project Detail page provides information about a selected project.

It includes:

* Project name and description.
* Project entry format.
* Project entries.
* Recorded project time.
* Project statistics.
* Due-date and overdue information where applicable.
* Options to add and manage entries.

The page acts as the main workspace for viewing the activity associated with a project.

### 7. Entry Creation and Editing

The entry form dynamically displays the fields defined by the selected project's entry format.

Depending on the configured entry format, students can enter different types of information, including richer field types introduced during the Intermediate phase.

The form supports:

* Custom field values.
* Date and time information.
* Time spent on the entry.
* Due dates.
* Completion-related information.
* Editing existing entries.
* Live time tracking where applicable.

The form is designed to allow students to capture logbook information quickly without requiring a fixed format for every project.

Capture works from the keyboard alone:

* **N**, pressed anywhere in the app while not typing in a field, opens a new entry on the project the student last worked in (or their first active project).
* The form starts from the predictable parts of the project's last entry — its time spent, tags and repeated field values — with a note saying so. The description, links, dates and computed values start empty, and checklist items come back unticked.
* The cursor starts in the first field of the form.
* **Ctrl+Enter** (Cmd+Enter on a Mac) saves the entry.

*See the [wireframe](Logbook%20wireframe.pdf) and [mockup](DigitalLogbook%20mockup.pdf) for the original entry form layout.*

### 8. Entry Format Management

The Entry Format interface allows students to define and manage the structure of their project entries.

Students can:

* Add custom fields.
* Define field types.
* Modify existing entry formats.
* Work with richer field types.
* Use computed fields where configured.
* Preserve previous entry-format versions when formats are modified.

This allows different projects to use entry structures that match their specific requirements.

### 9. Entries

The Entries page answers "what did I do?", as a logbook grouped by day with
each day's total time. Four compact figures sit at the top (this week, time
this week, streak, all time). One filter bar holds search, project and sort
order; less common filters (this week or overdue, archive, a project's own
fields, tags) open under **Filters**, and combinations can be saved.

Students can:

* Browse entries day by day, newest or oldest first.
* Search across their entries and fields, and narrow to one project.
* Combine filters, save them, and clear them.
* Open an entry to view or edit it.
* See an entry's due date as quiet context, without entries being treated as tasks.

The interface is designed to make previously recorded work easy to locate and review.

### 10. Alternative Entry Views

Besides the Entries timeline, two views organise one project's entries:

* **Board** — entries in columns, grouped by status (open or done) or by any of
  the project's own fields; entries without a value sit in a quieter
  **Not grouped** column. Each column shows its count.
* **Calendar** — a month of due dates and logged entries (a list on phones),
  starting the week on the day chosen in Settings, with Google Calendar sync.

### 11. Due Dates and Overdue Work

Entries can include due dates to help students track unfinished work.

The interface provides visual information for entries that are approaching or have passed their deadlines.

Students can identify:

* Entries with upcoming deadlines.
* Overdue entries.
* Unfinished work.
* Completed work.

Open Work is the page that owns unfinished work: **Overdue** (with how late
each item is), **Coming up** (the next two weeks, grouped by day, then later)
and **No date yet**. Each item can be marked done or given a new date in
place.

### 12. Profile and Settings

The Profile and Settings area allows students to manage their account and application preferences.

It provides access to account-related functionality and application settings, including:

* Profile information.
* Account management.
* Theme preferences.
* Data export.
* Data import.
* Other application settings.

The application supports light, dark, and system theme preferences.

Settings also turns reminder notifications on for the current device, and holds the two-factor authentication setup, including recovery codes.

*See the [mockup](DigitalLogbook%20mockup.pdf) for the profile and settings layout.*

### 13. Offline Capture

The interface supports capturing logbook entries when the student temporarily does not have a reliable connection.

Offline entries can be stored locally and synchronised when connectivity becomes available again.

The interface is designed to make offline capture consistent with the normal entry-creation workflow so that students do not need to use a separate interface.

### 14. Data Export and Import

The Settings area provides functionality for exporting and importing logbook data.

This allows students to:

* Export their logbook information for backup or portability.
* Import previously exported logbook data.
* Retain their project and entry information when moving or restoring data.

The import/export functionality is integrated into the existing application rather than requiring users to interact directly with the database.

### 15. Statistics

The Statistics page answers "how am I spending my time?": time logged across
all projects, then — for a chosen project — a **Breakdown** (measure,
calculate, group by) and **Over time** (per day, week or month, with real
period labels).

Students can also write their own expression, such as `SUM({Hours}) / COUNT()`, see its result immediately, and save it as a named statistic that sits beside the built-in ones and can be added to the dashboard. An expression that cannot be worked out explains why rather than showing a wrong number.

### 16. Reminders

The Reminders page has three tabs — **Needs attention**, **Upcoming** and
**Done & dismissed** — and every reminder says why it exists: set by the
student, or which rule made it. **Complete** is the main action, then
**Snooze 1 day** and **Dismiss**; students can create their own.

The reminder rules on the same page switch on automatic reminders for upcoming due dates, overdue entries, entries left untouched, and a daily prompt when nothing has been logged. With notifications turned on, reminders appear as system notifications, even when the logbook is closed.

### 17. Entry History

From an entry, students open its history: every saved version, oldest first, with what changed shown field by field against the current version. They can view the entry as it was on a chosen date, and restore an earlier version after confirming. A restore is added to the history rather than replacing it.

### 18. Automation Rules

On a project's page, students create rules of the form "when an entry is created or saved and these conditions hold, add or remove a tag or set the status". Only the conditions that make sense for each field type are offered. Rules can be edited, switched off and deleted.

### 19. Recurring Entries and Archiving

When creating an entry, students can make it repeat daily, weekly or monthly, and later stop it repeating. On the Entries page, old entries can be moved to the archive individually or in bulk, viewed there, and brought back.

### 20. My Grades

My Grades answers "where do I stand in each module, and what does the rest of
it need?". **Next assessment** sits at the top. Each module card shows, from
the grade engine:

* how many assessments are marked and remaining, and how much of the module's weight that is;
* the **average on marked work** and the points **secured** toward the final mark out of 100, kept as two separate figures;
* a bar of secured, still possible and no-longer-possible weight, with the target marked;
* one sentence for the target, such as "You need 80.0% on the remaining 50% to reach 70%".

Every figure is weighted by each assessment's own weight. A module whose
weights don't add up says so instead of showing figures worked out on the
wrong weights.

### 21. Profile

The Profile is an identity card — photo or initial, name, degree and year,
email, student number — with entries, time logged and streak; then twelve
weeks of activity as a heatmap whose every day is labelled for screen
readers; then recent projects and the tags used most.

### 22. Help Assistant

A help button on every page opens a short chat that answers "how do I…?"
questions about the logbook and offers a button to the right page. It is
backed by Google's Gemini API; see the
[AI Help Assistant](../extra-features/ai-help-assistant.md) for how it works.

## Responsive Design

The interface follows a responsive design approach so that the application remains usable across different screen sizes.

### Desktop

A sidebar navigation is used alongside the main content area.

The larger screen provides enough space for dashboards, project information, entry lists, and forms to be displayed simultaneously where appropriate.

### Tablet

The navigation and content areas adapt to the smaller screen width.

Layouts adjust to prevent unnecessary horizontal scrolling while maintaining access to the main application functionality.

### Mobile

The sidebar can be collapsed or replaced with a mobile navigation menu.

Forms, entry fields, project information, and lists use the available screen width so that core functionality remains accessible on smaller devices.

## Accessibility

The interface follows modern accessibility practices, including:

* Semantic HTML elements.
* Keyboard-accessible controls.
* Labels for form inputs.
* Sufficient colour contrast.
* Visible focus states.
* Descriptive button and link text.
* Responsive layouts.
* Clear visual distinction between different entry states.
* Accessible form validation and feedback where applicable.

Animations respect the operating system's reduced-motion setting.

Concretely, across the redesigned pages:

* Every page has one `h1` and sections named by their headings, so screen readers can jump between them; a **Skip to content** link comes first.
* The current sidebar page carries `aria-current="page"`; tabs use `role="tab"` with arrow-key movement; switches use `role="switch"` with `aria-checked`; menus open, move and close from the keyboard.
* Icon-only buttons have accessible names; charts and grade bars have text alternatives (`role="img"` labels, a `progressbar` with its value in words); every heatmap day is labelled.
* Status is never colour alone: overdue, quiet, archived, completed and dismissed each have words and an icon.
* A visible focus ring follows the accent colour on the page and a light ring on the dark sidebar.
* Small helper text is darkened on light backgrounds to meet a 4.5:1 contrast ratio.

## Design Consistency

The application uses consistent layouts, navigation patterns, controls, and visual conventions across its main screens.

Common functionality such as creating, editing, viewing, and filtering entries follows the same interaction patterns throughout the application.

This consistency reduces the amount of navigation and relearning required when students move between projects, entries, and account settings.
