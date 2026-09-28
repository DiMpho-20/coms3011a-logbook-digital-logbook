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

## Design Artifacts

The interface was designed using low-fidelity wireframes followed by a higher-fidelity mockup:

* 📄 [Wireframe](../Logbook%20wireframe.pdf) — initial layout and navigation structure for each screen.
* 📄 [Mockup](DigitalLogbook%20mockup.pdf) — refined visual design based on the wireframe.

The implemented interface follows the overall structure established by these design artifacts while incorporating additional functionality introduced during the Intermediate and Advanced phases.

## Application Navigation

Authenticated users reach every main area from the sidebar:

```text
Sidebar
├── Dashboard      chosen and arranged panels
├── Projects ──► Project Detail
│                 ├── Entry Form
│                 ├── Entry Format
│                 ├── Entry History
│                 └── Automation Rules
├── Entries        search, filters, saved filters, archive
├── Open Work      unfinished entries by urgency
├── Stats          statistics, custom expressions, saved statistics
├── Calendar       entries by due date, Google Calendar sync
├── Board          entries as a board
├── Reminders      reminders and reminder rules
├── Profile
└── Settings       account, 2FA, notifications, data export/import
```

Offline capture works through the normal entry form, and a count of due reminders is shown in the sidebar.

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

The Dashboard provides an overview of the student's activity, built from panels the student chooses.

Available panels include:

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

The Projects page displays the student's projects.

Students can:

* Create a project.
* View project details.
* Edit project information.
* Archive a project.
* Unarchive an archived project.
* Open individual project details.

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

*See the [wireframe](../Logbook%20wireframe.pdf) and [mockup](DigitalLogbook%20mockup.pdf) for the original entry form layout.*

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

The Entries page allows students to browse their recorded work.

Students can:

* View entries chronologically.
* Filter entries by project.
* Search or browse recorded entries.
* Open an entry to view its details.
* Identify unfinished or overdue work.
* Access entries using alternative views where supported.

The interface is designed to make previously recorded work easy to locate and review.

### 10. Alternative Entry Views

The application supports alternative ways of viewing logbook entries to make project activity easier to understand.

Depending on the selected view, entries can be organised according to information such as dates, deadlines, or project activity.

These views are intended to provide students with a more useful representation of their work than a single chronological list.

### 11. Due Dates and Overdue Work

Entries can include due dates to help students track unfinished work.

The interface provides visual information for entries that are approaching or have passed their deadlines.

Students can identify:

* Entries with upcoming deadlines.
* Overdue entries.
* Unfinished work.
* Completed work.

This information is surfaced through the Entries and relevant project views.

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

The Statistics page shows time per project, totals and averages of any numeric field grouped by another field, and values plotted over time by day, week or month.

Students can also write their own expression, such as `SUM({Hours}) / COUNT()`, see its result immediately, and save it as a named statistic that sits beside the built-in ones and can be added to the dashboard. An expression that cannot be worked out explains why rather than showing a wrong number.

### 16. Reminders

The Reminders page lists reminders that are due now, upcoming, and completed or dismissed. Each can be completed, snoozed or dismissed, and students can create their own.

The reminder rules on the same page switch on automatic reminders for upcoming due dates, overdue entries, entries left untouched, and a daily prompt when nothing has been logged. With notifications turned on, reminders appear as system notifications, even when the logbook is closed.

### 17. Entry History

From an entry, students open its history: every saved version, oldest first, with what changed shown field by field against the current version. They can view the entry as it was on a chosen date, and restore an earlier version after confirming. A restore is added to the history rather than replacing it.

### 18. Automation Rules

On a project's page, students create rules of the form "when an entry is created or saved and these conditions hold, add or remove a tag or set the status". Only the conditions that make sense for each field type are offered. Rules can be edited, switched off and deleted.

### 19. Recurring Entries and Archiving

When creating an entry, students can make it repeat daily, weekly or monthly, and later stop it repeating. On the Entries page, old entries can be moved to the archive individually or in bulk, viewed there, and brought back.

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

Accessibility remains an ongoing area for improvement, with further testing and WCAG-focused refinements planned as the project continues.

## Design Consistency

The application uses consistent layouts, navigation patterns, controls, and visual conventions across its main screens.

Common functionality such as creating, editing, viewing, and filtering entries follows the same interaction patterns throughout the application.

This consistency reduces the amount of navigation and relearning required when students move between projects, entries, and account settings.
