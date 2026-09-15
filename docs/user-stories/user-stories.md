# Sprint 1 – User Stories

## Authentication User Stories

## US00.1 – Create an Account

**User Story:** As a student, I want to create an account using my credentials, so that I can have a personal logbook and keep my projects and entries associated with my account.

### Acceptance Tests

| **#** | **Given**                                               | **When**                                   | **Then**                                                                       | **Status** |
| ----- | ------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ | ---------- |
| 1     | I am a student                                          | I access the sign-up page                  | I see a sign-up form                                                           | Pass       |
| 2     | I am on the sign-up form                                | I provide the required account information | The system accepts the provided information                                    | Pass       |
| 3     | I have entered my account information                   | I submit the registration form             | The system validates the provided information                                  | Pass       |
| 4     | An account already exists with the provided credentials | I attempt to register                      | The system prevents registration and indicates that the account already exists | Pass       |
| 5     | I have successfully registered an account               | I attempt to sign in                       | I can sign in to my account                                                    | Pass       |

---

## US00.2 – Sign In

**User Story:** As a registered student, I want to sign in to my account, so that I can access my projects and logbook entries securely.

### Acceptance Tests

| **#** | **Given**                           | **When**                  | **Then**                                      | **Status** |
| ----- | ----------------------------------- | ------------------------- | --------------------------------------------- | ---------- |
| 1     | I am a registered student           | I open the sign-in page   | I can enter my login credentials              | Pass       |
| 2     | I have entered my login credentials | I submit the sign-in form | The system validates my credentials           | Pass       |
| 3     | I have entered valid credentials    | I submit the sign-in form | I am granted access to my account             | Pass       |
| 4     | I have entered invalid credentials  | I submit the sign-in form | I am not granted access to my account         | Pass       |
| 5     | I am signed in                      | I access my logbook       | My logbook data is associated with my account | Pass       |

---

## US00.3 – Reset Password

**User Story:** As a registered student, I want to reset my password if I forget it, so that I can regain access to my account.

### Acceptance Tests

| **#** | **Given**                                               | **When**                           | **Then**                                            | **Status** |
| ----- | ------------------------------------------------------- | ---------------------------------- | --------------------------------------------------- | ---------- |
| 1     | I am a registered student who has forgotten my password | I access the password reset option | I can request a password reset                      | Pass       |
| 2     | I have requested a password reset                       | I follow the reset process         | The system provides a secure password-reset process | Pass       |
| 3     | I am completing the password reset process              | I provide a new password           | The system allows me to create a new password       | Pass       |
| 4     | I have successfully reset my password                   | I sign in using my new password    | I can access my account                             | Pass       |

---

## US00.4 – Delete Account

**User Story:** As a registered student, I want to delete my account, so that I can remove my account when I no longer want to use the logbook.

### Acceptance Tests

| **#** | **Given**                                   | **When**                          | **Then**                                                                   | **Status** |
| ----- | ------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------- | ---------- |
| 1     | I am a registered student                   | I access my account settings      | I can access an account deletion option                                    | Pass       |
| 2     | I have selected the account deletion option | I attempt to delete my account    | The system requires confirmation before deleting the account               | Pass       |
| 3     | I have confirmed account deletion           | The system processes the deletion | My account is no longer usable                                             | Pass       |
| 4     | My account has been deleted                 | I check my logbook data           | My logbook data is handled according to the project's data-deletion policy | Pass       |

---

# Digital Logbook – Basic User Stories

## US01 – Create a Project

**User Story:** As a student, I want to create a project with a name and description, so that I can organise my work into separate projects.

### Acceptance Tests

| **#** | **Given**                    | **When**                            | **Then**                                             | **Status** |
| ----- | ---------------------------- | ----------------------------------- | ---------------------------------------------------- | ---------- |
| 1     | I am a student               | I create a project                  | A new project is created                             | Pass       |
| 2     | I am creating a project      | I attempt to save it without a name | The system requires the project to have a name       | Pass       |
| 3     | I am creating a project      | I provide a description             | The project is created with the provided description | Pass       |
| 4     | I have created a project     | I view my project list              | The newly created project is displayed               | Pass       |
| 5     | I have created a new project | I view its status                   | The project starts as active                         | Pass       |

---

## US02 – Define a Project's Entry Format

**User Story:** As a student, I want to define which fields an entry contains and the type of value each field stores for a project, so that I can record information in a format that suits that project.

### Acceptance Tests

| **#** | **Given**                            | **When**                           | **Then**                                            | **Status** |
| ----- | ------------------------------------ | ---------------------------------- | --------------------------------------------------- | ---------- |
| 1     | I have a project                     | I edit the project's entry format  | I can add fields to the entry format                | Pass       |
| 2     | I am adding a field                  | I provide a field name             | The field is given the specified name               | Pass       |
| 3     | I am adding a field                  | I select a value type              | The field is assigned the selected value type       | Pass       |
| 4     | I have defined an entry format       | I save the format                  | The entry format is associated with its project     | Pass       |
| 5     | I have multiple projects             | I define entry formats for them    | Different projects can have different entry formats | Pass       |
| 6     | A project has a defined entry format | I create an entry for that project | The defined fields are used when creating the entry | Pass       |

---

## US03 – Record a Logbook Entry

**User Story:** As a student, I want to create an entry for a project using its defined entry format, so that I can keep a record of the work I have done.

### Acceptance Tests

| **#** | **Given**                                       | **When**                                 | **Then**                                               | **Status** |
| ----- | ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ | ---------- |
| 1     | I am creating a logbook entry                   | I select a project                       | The entry is associated with the selected project      | Pass       |
| 2     | The selected project has a defined entry format | I create an entry                        | The entry displays the fields defined for that project | Pass       |
| 3     | I am completing a logbook entry                 | I enter values into the available fields | The values are accepted for the entry                  | Pass       |
| 4     | I am creating a logbook entry                   | The entry is created                     | The entry records when it was created                  | Pass       |
| 5     | I have completed the required entry fields      | I save the entry                         | The entry is saved successfully                        | Pass       |
| 6     | I have saved an entry                           | I view the entry                         | The entry is associated with the selected project      | Pass       |

---

## US04 – Record Time Spent on an Entry

**User Story:** As a student, I want to record the amount of time spent on an entry, so that my time can be tracked against the project.

### Acceptance Tests

| **#** | **Given**                         | **When**                          | **Then**                                          | **Status** |
| ----- | --------------------------------- | --------------------------------- | ------------------------------------------------- | ---------- |
| 1     | I am creating or editing an entry | I view the entry fields           | I can see a field for recording time spent        | Pass       |
| 2     | I am recording time for an entry  | I enter the amount of time spent  | The amount of time is accepted                    | Pass       |
| 3     | I have entered the time spent     | I save the entry                  | The recorded time is stored with the entry        | Pass       |
| 4     | The entry belongs to a project    | I record time spent on the entry  | The recorded time is associated with that project | Pass       |
| 5     | A project has recorded entries    | I add an entry with recorded time | The project's total recorded time increases       | Pass       |

---

## US05 – Archive a Project

**User Story:** As a student, I want to archive a project when I have finished working on it, so that completed projects are separated from my active projects without losing their records.

### Acceptance Tests

| **#** | **Given**                            | **When**                      | **Then**                                                     | **Status** |
| ----- | ------------------------------------ | ----------------------------- | ------------------------------------------------------------ | ---------- |
| 1     | I have an active project             | I choose to archive it        | The project is archived                                      | Pass       |
| 2     | I have archived a project            | I view my active projects     | The archived project is no longer shown as an active project | Pass       |
| 3     | The project contains logbook entries | I archive the project         | The entries belonging to the project are not deleted         | Pass       |
| 4     | I have an archived project           | I access the archived project | I can still access the project and its entries               | Pass       |
| 5     | I have archived a project            | I view my project history     | The project remains part of my historical record             | Pass       |

---

## US06 – Browse and Filter My Entries

**User Story:** As a student, I want to browse my logbook entries and narrow them down to a specific project, so that I can easily review the work I have recorded.

### Acceptance Tests

| **#** | **Given**                             | **When**                       | **Then**                                                     | **Status** |
| ----- | ------------------------------------- | ------------------------------ | ------------------------------------------------------------ | ---------- |
| 1     | I have multiple logbook entries       | I view my entries              | My entries are displayed in chronological order              | Pass       |
| 2     | I am viewing my logbook entries       | I view an entry                | The entry displays its associated project                    | Pass       |
| 3     | I have entries from multiple projects | I filter my entries by project | Only entries belonging to the selected project are displayed | Pass       |
| 4     | I am viewing my logbook entries       | I open an entry                | I can view the recorded information for that entry           | Pass       |
| 5     | I am viewing filtered entries         | I apply or remove a filter     | My entries are not removed or modified                       | Pass       |



# Sprint 2 – User Stories

# Digital Logbook – Intermediate User Stories

## US07 – Add Rich Field Types

**User Story:** As a student, I want to use richer field types such as tags, checklists, links, and references in my entry format, so that I can record different kinds of information about my work.

### Acceptance Tests

| **#** | **Given**                                  | **When**                        | **Then**                                                 | **Status** |
| ----- | ------------------------------------------ | ------------------------------- | -------------------------------------------------------- | ---------- |
| 1     | I have a project                           | I edit its entry format         | I can select from additional field types                 | Pass       |
| 2     | I am adding a field                        | I select a tag field type       | The field accepts tag values                             | Pass       |
| 3     | I am adding a field                        | I select a checklist field type | The field allows checklist items to be recorded          | Pass       |
| 4     | I am adding a field                        | I select a link field type      | The field allows a link to be recorded                   | Pass       |
| 5     | I am adding a field                        | I select a reference field type | The field allows a reference to another entry or project | Pass       |
| 6     | I have created an entry using a rich field | I view the entry                | The rich field values are displayed correctly            | Pass       |

---

## US08 – Modify an Existing Entry Format

**User Story:** As a student, I want to add, remove, or rename fields in an existing entry format, so that my logbook can adapt as my needs change.

### Acceptance Tests

| **#** | **Given**                                      | **When**                  | **Then**                                     | **Status** |
| ----- | ---------------------------------------------- | ------------------------- | -------------------------------------------- | ---------- |
| 1     | I have a project with an existing entry format | I edit the format         | I can add a new field                        | Pass       |
| 2     | I have an existing field                       | I rename the field        | The field has the new name                   | Pass       |
| 3     | I have an existing field                       | I remove the field        | The field is removed from the current format | Pass       |
| 4     | I have existing entries                        | I change the entry format | The existing entries are not deleted         | Pass       |
| 5     | I have changed an entry format                 | I view an existing entry  | The entry remains readable                   | Pass       |

---

## US09 – Preserve Previous Entry Format Versions

**User Story:** As a student, I want previous versions of an entry format to remain readable, so that changing my format does not make my existing logbook entries unusable.

### Acceptance Tests

| **#** | **Given**                                    | **When**                      | **Then**                                     | **Status** |
| ----- | -------------------------------------------- | ----------------------------- | -------------------------------------------- | ---------- |
| 1     | I have an existing entry format              | I make a change to the format | A new version of the format is created       | Pass       |
| 2     | I have multiple format versions              | I view the format history     | I can see the previous versions              | Pass       |
| 3     | I have entries created using an older format | I view those entries          | The entries remain readable                  | Pass       |
| 4     | I have changed my entry format               | I create a new entry          | The new entry uses the latest format version | Pass       |

---

## US10 – Use Computed Fields

**User Story:** As a student, I want to define fields whose values are calculated from other fields, so that information can be generated automatically instead of being entered manually.

### Acceptance Tests

| **#** | **Given**                                   | **When**                  | **Then**                                                     | **Status** |
| ----- | ------------------------------------------- | ------------------------- | ------------------------------------------------------------ | ---------- |
| 1     | I am defining an entry format               | I create a computed field | I can specify that the field is calculated from other fields | Pass       |
| 2     | I have defined a computed field             | I create an entry         | The system calculates the field's value automatically        | Pass       |
| 3     | A computed field depends on other fields    | I change the input values | The computed value is updated                                | Pass       |
| 4     | I view an entry containing a computed field | I open the entry          | The calculated value is displayed                            | Pass       |

---

## US11 – Analyse Custom Fields

**User Story:** As a student, I want to total, group, and compare values from my custom fields, so that I can gain useful statistics from my logbook.

### Acceptance Tests

| **#** | **Given**                                        | **When**                      | **Then**                                                                             | **Status** |
| ----- | ------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------ | ---------- |
| 1     | I have entries containing a numeric custom field | I request a total             | The system calculates the total value                                                | Pass       |
| 2     | I have entries containing a custom field         | I group entries by that field | The entries are grouped according to its values                                      | Pass       |
| 3     | I have entries containing a comparable field     | I compare the values          | The system displays the values in a way that allows comparison                       | Pass       |
| 4     | I have custom field data over time               | I request a time-based view   | The system displays the values over time                                             | Pass       |
| 5     | I define a new custom field                      | I analyse the field           | The system can use the field without requiring a predefined field in the application | Pass       |

---

## US12 – View Entries Using Alternative Views

**User Story:** As a student, I want to view my entries using different views such as a calendar or board, so that I can organise my work in a way that suits me.

### Acceptance Tests

| **#** | **Given**               | **When**                     | **Then**                                        | **Status** |
| ----- | ----------------------- | ---------------------------- | ----------------------------------------------- | ---------- |
| 1     | I have logbook entries  | I select the calendar view   | My entries are displayed in a calendar          | Pass       |
| 2     | I have logbook entries  | I select the board view      | My entries are displayed on a board             | Pass       |
| 3     | I am viewing the board  | I select a field to group by | The entries are grouped according to that field | Pass       |
| 4     | I am viewing my entries | I switch between views       | The same underlying entries remain available    | Pass       |

---

## US13 – Track Unfinished Work and Due Dates

**User Story:** As a student, I want to record due dates and track unfinished work, so that I can keep track of what I still need to complete.

### Acceptance Tests

| **#** | **Given**                            | **When**                    | **Then**                                   | **Status** |
| ----- | ------------------------------------ | --------------------------- | ------------------------------------------ | ---------- |
| 1     | I am creating or editing an entry    | I provide a due date        | The due date is stored with the entry      | Pass       |
| 2     | I have an entry that is not complete | I view my unfinished work   | The entry is shown as unfinished           | Pass       |
| 3     | I have an unfinished entry           | I mark the work as complete | The entry is no longer shown as unfinished | Pass       |
| 4     | I have multiple unfinished entries   | I view my unfinished work   | The due dates are displayed                | Pass       |
| 5     | I have an entry with a due date      | I view the entry            | The due date is clearly displayed          | Pass       |

---

## US14 – Capture Entries Offline

**User Story:** As a student, I want to create logbook entries while offline, so that I can continue recording my work without an internet connection.

### Acceptance Tests

| **#** | **Given**                                     | **When**                                     | **Then**                                                   | **Status** |
| ----- | --------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- | ---------- |
| 1     | I have no internet connection                 | I open my logbook                            | I can access the functionality required to create an entry | Pass       |
| 2     | I am offline                                  | I create an entry                            | The entry is stored locally                                | Pass       |
| 3     | I have created entries while offline          | My device reconnects to the internet         | The offline entries are synchronised                       | Pass       |
| 4     | I have offline entries waiting to synchronise | Synchronisation occurs                       | The entries are available in the online logbook            | Pass       |
| 5     | I create an entry while offline               | The device loses connectivity during capture | The entry is not lost                                      | Pass       |

---

## US15 – Export and Import Logbook Data

**User Story:** As a student, I want to export and import my logbook data in a readable format, so that I can keep a copy of my records and restore them when needed.

### Acceptance Tests

| **#** | **Given**                               | **When**                        | **Then**                                                      | **Status** |
| ----- | --------------------------------------- | ------------------------------- | ------------------------------------------------------------- | ---------- |
| 1     | I have logbook entries                  | I choose to export my data      | The system generates an export file                           | Pass       |
| 2     | I export my logbook                     | I open the exported file        | The data is stored in a readable format                       | Pass       |
| 3     | I have previously exported logbook data | I choose to import the data     | The system accepts the exported file                          | Pass       |
| 4     | I import valid logbook data             | The import completes            | The imported projects and entries are available in my logbook | Pass       |
| 5     | I attempt to import invalid data        | The system processes the import | The system informs me that the data cannot be imported        | Pass       |
