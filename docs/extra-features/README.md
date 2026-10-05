# Extra Features

This folder documents the Digital Logbook's **extra features**: functionality
the team built beyond the user stories in
[`docs/user-stories/user-stories.md`](../user-stories/user-stories.md)
(US00.1–US37). Each document explains what the feature does, why we added it,
and how it is implemented, from the user interface through the API to the
database and any external service.

| Feature | What it adds | Origin |
|---|---|---|
| [AI Help Assistant](ai-help-assistant.md) | An in-app chat, backed by Google's Gemini API, that answers "how do I…?" questions and offers a button to the right page | Built to help students find their way around the app |
| [My Grades](my-grades.md) | Module and assessment tracking: secured marks, what is needed for a target, what-if marks, and reminders before tests and due dates | SUS Round 2 feedback, tracked as `FEAT-009` |
| [Google Calendar Sync](google-calendar-sync.md) | Copies open entries' due dates into the student's own Google Calendar as all-day events | Tracked as `FEAT-001` |

## How each document is organised

Every feature document follows the same structure, so they can be compared
side by side:

1. Overview
2. Problem / Motivation
3. What It Does
4. How It Works
5. Technical Implementation
6. User Workflow / Demonstration
7. Screenshots
8. Limitations
9. Future Improvements
10. Contributors

The AI Help Assistant document has an additional section covering the AI
provider, the model, what is sent to it, how prompts and responses are
handled, fallbacks, and privacy.

## Screenshots

Screenshots belong in `images/<feature-name>/` inside this folder, for example
`images/my-grades/overview.png`. Each document lists the screenshots it
expects, with their paths, under **7. Screenshots**; the image tags are
commented out until the files are added, so no document shows a broken image
in the meantime.

## Conventions

- Source files are referred to by their path from the repository root, such as
  `apps/backend/src/utils/assistant.ts`, as in the rest of `docs/`.
- No document contains credentials. Configuration is described by the
  *name* of each environment variable only; values live in each environment's
  `.env` and are never committed.
- Statements describe the code as it is on the `Dineo` branch. Where a document
  could not confirm something from the code, it says so.
