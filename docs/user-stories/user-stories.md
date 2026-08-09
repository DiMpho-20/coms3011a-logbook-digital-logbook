**# Authentication User Stories**



**## US00.1 – Create an Account**



**\*\*As a\*\* student,**

**\*\*I want to\*\* create an account using my credentials,**

**\*\*so that\*\* I can have a personal logbook and keep my projects and entries associated with my account.**



**### Acceptance Criteria**



**\* The student can access a sign-up form.**

**\* The student can provide the required account information.**

**\* The system validates the provided information.**

**\* The system prevents registration with an account that already exists.**

**\* A successfully registered student can sign in to their account.**



**---**



**## US00.2 – Sign In**



**\*\*As a\*\* registered student,**

**\*\*I want to\*\* sign in to my account,**

**\*\*so that\*\* I can access my projects and logbook entries securely.**



**### Acceptance Criteria**



**\* The student can enter their login credentials.**

**\* The system validates the credentials.**

**\* Valid credentials allow the student to access their account.**

**\* Invalid credentials do not allow access.**

**\* The student's logbook data is associated with their account.**



**---**



**## US00.3 – Reset Password**



**\*\*As a\*\* registered student,**

**\*\*I want to\*\* reset my password if I forget it,**

**\*\*so that\*\* I can regain access to my account.**



**### Acceptance Criteria**



**\* The student can request a password reset.**

**\* The system provides a secure password-reset process.**

**\* The student can create a new password through the reset process.**

**\* The student can sign in using the new password.**



**---**



**## US00.4 – Delete Account**



**\*\*As a\*\* registered student,**

**\*\*I want to\*\* delete my account,**

**\*\*so that\*\* I can remove my account when I no longer want to use the logbook.**



**### Acceptance Criteria**



**\* The student can access an account deletion option.**

**\* The system requires confirmation before deleting the account.**

**\* The account is no longer usable after deletion.**

**\* The student's logbook data is handled according to the project's data-deletion policy.**

&#x20;





&#x20;**# Digital Logbook – Basic User Stories**



**## US01 – Create a Project**



**\*\*As a\*\* student,**

**\*\*I want to\*\* create a project with a name and description,**

**\*\*so that\*\* I can organise my work into separate projects.**



**### Acceptance Criteria**



**\* The student can create a project.**

**\* A project must have a name.**

**\* A project can have a description.**

**\* The newly created project is displayed in the student's project list.**

**\* A project starts as active.**



**---**



**## US02 – Define a Project's Entry Format**



**\*\*As a\*\* student,**

**\*\*I want to\*\* define which fields an entry contains and the type of value each field stores for a project,**

**\*\*so that\*\* I can record information in a format that suits that project.**



**### Acceptance Criteria**



**\* The student can add fields to a project's entry format.**

**\* The student can give each field a name.**

**\* The student can select the value type for each field.**

**\* The entry format is associated with its project.**

**\* Different projects can have different entry formats.**

**\* The defined fields are used when creating entries for that project.**



**---**



**## US03 – Record a Logbook Entry**



**\*\*As a\*\* student,**

**\*\*I want to\*\* create an entry for a project using its defined entry format,**

**\*\*so that\*\* I can keep a record of the work I have done.**



**### Acceptance Criteria**



**\* The student can select a project when creating an entry.**

**\* The entry displays the fields defined for that project.**

**\* The student can enter values for the available fields.**

**\* The entry records when it was created.**

**\* The student can save the entry.**

**\* The saved entry is associated with the selected project.**



**---**



**## US04 – Record Time Spent on an Entry**



**\*\*As a\*\* student,**

**\*\*I want to\*\* record the amount of time spent on an entry,**

**\*\*so that\*\* my time can be tracked against the project.**



**### Acceptance Criteria**



**\* An entry includes a field for recording time spent.**

**\* The student can enter the amount of time spent on the activity.**

**\* The recorded time is stored with the entry.**

**\* The time is associated with the project that the entry belongs to.**

**\* The project’s total recorded time increases when an entry is added.**



**---**



**## US05 – Archive a Project**



**\*\*As a\*\* student,**

**\*\*I want to\*\* archive a project when I have finished working on it,**

**\*\*so that\*\* completed projects are separated from my active projects without losing their records.**



**### Acceptance Criteria**



**\* The student can archive an active project.**

**\* An archived project is no longer shown as an active project.**

**\* Entries belonging to the archived project are not deleted.**

**\* The student can still access an archived project and its entries.**

**\* The project remains part of the student's historical record.**



**---**



**## US06 – Browse and Filter My Entries**



**\*\*As a\*\* student,**

**\*\*I want to\*\* browse my logbook entries and narrow them down to a specific project,**

**\*\*so that\*\* I can easily review the work I have recorded.**



**### Acceptance Criteria**



**\* The student can view their entries in chronological order.**

**\* Each entry displays its associated project.**

**\* The student can filter entries by project.**

**\* The student can open an entry to view its recorded information.**

**\* Filtering does not remove or modify entries.**

