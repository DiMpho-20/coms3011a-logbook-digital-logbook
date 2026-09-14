# UI Design

## Design Goals

The Digital Logbook interface is designed to be:

- Simple and easy for students to navigate.
- Responsive across desktop, tablet, and mobile devices.
- Accessible and readable.
- Consistent across all pages.
- Focused on quickly recording and reviewing logbook entries.

## Design Artifacts

The interface was designed using low-fidelity wireframes followed by a
higher-fidelity mockup:

- 📄 [Wireframe](../Logbook%20wireframe.pdf) — initial layout and navigation structure for each screen.
- 📄 [Mockup](DigitalLogbook%20mockup.pdf) — refined visual design based on the wireframe.

## Application Navigation

Authenticated users will have access to the following main areas:

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
      ┌───────────────┐
      │Project Detail │
      └───────┬───────┘
              │
       ┌──────┴───────┐
       ▼              ▼
 ┌───────────┐  ┌─────────────┐
 │Entry Form │  │Entry Format │
 └───────────┘  └─────────────┘
```

## Main Screens

### 1. Landing Page

The landing page introduces the Digital Logbook and provides options to:

- Sign in
- Create an account

*See the [mockup](DigitalLogbook%20mockup.pdf) for the landing page layout.*

### 2. Sign In

Allows an existing student to authenticate using their account credentials.

*See the [mockup](DigitalLogbook%20mockup.pdf) for the sign-in screen.*

### 3. Registration

Allows a new student to create an account.

*See the [mockup](DigitalLogbook%20mockup.pdf) for the registration screen.*

### 4. Dashboard

The dashboard provides an overview of the student's activity.

It will include:

- Active projects
- Recent logbook entries
- Time recorded
- Quick actions for creating projects and entries

*The dashboard surfaces active projects and recent entries first, in
line with the goal of quick entry review. See the
[mockup](DigitalLogbook%20mockup.pdf) for the full layout.*

### 5. Projects

The Projects page displays the student's projects.

Students can:

- Create a project
- View a project
- Archive a project
- Open project details

*See the [mockup](DigitalLogbook%20mockup.pdf) for the projects list layout.*

### 6. Project Detail

The project detail page provides information about a selected project.

It will include:

- Project name and description
- Entry format
- Project entries
- Recorded time
- Option to add an entry

*See the [mockup](DigitalLogbook%20mockup.pdf) for the project detail layout.*

### 7. Entry Creation

The entry form dynamically displays the fields defined by the selected
project's entry format.

The student can enter:

- Field values
- Date
- Time spent

*See the [wireframe](../Logbook%20wireframe.pdf) and
[mockup](DigitalLogbook%20mockup.pdf) for the entry form layout.*

### 8. Entries

The Entries page allows students to browse their recorded work.

Students can:

- View entries chronologically
- Filter entries by project
- Open an entry to view its details

*See the [mockup](DigitalLogbook%20mockup.pdf) for the entries list layout.*

### 9. Profile and Settings

The profile/settings area allows students to manage their account and
application preferences.

*See the [mockup](DigitalLogbook%20mockup.pdf) for the profile and settings layout.*

## Responsive Design

The interface will follow a responsive design approach.

### Desktop

A sidebar navigation can be used alongside the main content area.

### Tablet

The navigation and content areas will adapt to the smaller screen width.

### Mobile

The sidebar will be replaced or collapsed into a mobile navigation menu,
while forms and content will use the available screen width.

## Accessibility

The interface will follow modern accessibility practices, including:

- Semantic HTML elements.
- Keyboard-accessible controls.
- Labels for form inputs.
- Sufficient colour contrast.
- Visible focus states.
- Descriptive button and link text.
- Responsive layouts.
