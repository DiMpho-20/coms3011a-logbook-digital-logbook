# UI Design

## Design Goals

The Digital Logbook interface is designed to be:

- Simple and easy for students to navigate.
- Responsive across desktop, tablet, and mobile devices.
- Accessible and readable.
- Consistent across all pages.
- Focused on quickly recording and reviewing logbook entries.

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

### 2. Sign In

Allows an existing student to authenticate using their account credentials.

### 3. Registration

Allows a new student to create an account.

### 4. Dashboard

The dashboard provides an overview of the student's activity.

It will include:

- Active projects
- Recent logbook entries
- Time recorded
- Quick actions for creating projects and entries

### 5. Projects

The Projects page displays the student's projects.

Students can:

- Create a project
- View a project
- Archive a project
- Open project details

### 6. Project Detail

The project detail page provides information about a selected project.

It will include:

- Project name and description
- Entry format
- Project entries
- Recorded time
- Option to add an entry

### 7. Entry Creation

The entry form dynamically displays the fields defined by the selected
project's entry format.

The student can enter:

- Field values
- Date
- Time spent

### 8. Entries

The Entries page allows students to browse their recorded work.

Students can:

- View entries chronologically
- Filter entries by project
- Open an entry to view its details

### 9. Profile and Settings

The profile/settings area allows students to manage their account and
application preferences.

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