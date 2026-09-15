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

The implemented interface follows the overall structure established by these design artifacts while incorporating additional functionality introduced during the Intermediate phase.

## Application Navigation

Authenticated users have access to the following main areas:

```text
                    ┌──────────────┐
                    │   Dashboard  │
                    └──────┬───────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
        ┌─────────┐   ┌──────────┐  ┌──────────┐
        │ Projects│   │ Entries  │  │ Profile  │
        └────┬────┘   └──────────┘  └──────────┘
             │
             ▼
      ┌────────────────┐
      │ Project Detail │
      └───────┬────────┘
              │
       ┌──────┴────────┐
       ▼               ▼
 ┌───────────┐  ┌─────────────┐
 │Entry Form │  │Entry Format │
 └───────────┘  └─────────────┘
```

Additional functionality such as alternative entry views, notifications, offline capture, and data import/export is accessible through the relevant application pages.

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

The Dashboard provides an overview of the student's activity.

It includes:

* Active projects.
* Recent logbook entries.
* Time recorded.
* Project-related statistics.
* Overdue work information.
* Quick actions for creating projects and entries.

The dashboard prioritises active projects, recent activity, and important work information so that students can quickly understand their current logbook activity.

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

Accessibility remains an ongoing area for improvement, with further testing and WCAG-focused refinements planned as the project continues.

## Design Consistency

The application uses consistent layouts, navigation patterns, controls, and visual conventions across its main screens.

Common functionality such as creating, editing, viewing, and filtering entries follows the same interaction patterns throughout the application.

This consistency reduces the amount of navigation and relearning required when students move between projects, entries, and account settings.
