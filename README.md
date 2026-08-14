# Digital Logbook (COMS3011A)
Group: no-boys-just-bugs


# Digital Logbook

A web-based digital logbook application designed to help university students keep track of their projects, work completed, time spent, and tasks that still need to be done.

## Overview

The Digital Logbook is intended to replace a physical logbook with a flexible digital version that can be accessed wherever the user is.

The core idea of the system is that each project can have its own **customisable logbook entry format**. Users can define the fields that an entry contains and the type of value each field stores. This allows the logbook to adapt to different projects rather than forcing every project to use the same fixed entry structure.

This repository is organised as a monorepo containing the frontend application, backend API, and shared TypeScript definitions.

## Project Goals

The main goals of the Digital Logbook are to:

* Allow users to create and manage projects.
* Allow users to customise the fields used in their logbook entries.
* Make capturing new entries quick and easy.
* Record the amount of time spent on projects.
* Provide useful statistics about the user's work.
* Allow users to browse and search previous entries.
* Allow users to filter entries by project.
* Allow projects to be archived when they are no longer active.

## Basic Features

The initial implementation focuses on the **Basic** requirements:

* Customisable entry formats for each project.
* Quick creation of logbook entries.
* Project creation, description, and archiving.
* Recording time spent on entries.
* Basic statistics about projects and entries.
* Timeline for browsing entries.
* Searching across entries.
* Filtering entries by project.

Intermediate and Advanced features will be considered after the Basic requirements have been implemented.

## Technology Stack

### Frontend

* React
* Vite
* TypeScript

### Backend

* Node.js 22
* Express
* TypeScript

### Database

* PostgreSQL

The database layer is configured through the `DATABASE_URL` environment variable.

### Shared Package

The `packages/shared` package contains TypeScript definitions and interfaces that can be shared between the frontend and backend.

## Project Structure

```text
coms3011a-logbook-digital-logbook/
│
├── apps/
│   ├── frontend/          # React + Vite frontend application
│   └── backend/           # Node.js + Express API server
│
├── packages/
│   └── shared/            # Shared TypeScript definitions and interfaces
│
├── docs/                  # Project documentation
│   ├── architecture.md
│   ├── client-interactions.md
│   ├── index.md
│   └── setup.md
│
├── .gitignore
├── mkdocs.yml
├── package.json
└── package-lock.json
```

## Application Architecture

The frontend and backend are developed as separate applications and communicate through a hand-written HTTP API.

```text
┌──────────────────────────────────────┐
│              Frontend                │
│        React + Vite + TypeScript     │
└──────────────────┬───────────────────┘
                   │
                   │ HTTP API
                   ▼
┌──────────────────────────────────────┐
│               Backend                │
│    Express + Node.js 22 + TypeScript │
└──────────────────┬───────────────────┘
                   │
                   │ Database connection
                   ▼
┌──────────────────────────────────────┐
│             PostgreSQL               │
└──────────────────────────────────────┘
```

## Development Setup

### Prerequisites

Install the following before setting up the project:

* Node.js 22 or later
* npm 10 or later
* nvm (recommended)
* PostgreSQL

### Clone the Repository

```bash
git clone https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook.git
cd coms3011a-logbook-digital-logbook
```

### Select the Node.js Version

If using nvm:

```bash
nvm use
```

### Install Dependencies

Install all workspace dependencies from the repository root:

```bash
npm install
```

### Configure Environment Variables

Create the backend environment file:

```text
apps/backend/.env
```

Add the PostgreSQL database connection string:

```env
DATABASE_URL="postgresql://<user>:<password>@<host>/<dbname>?sslmode=require"
```

Do not commit the `.env` file or real database credentials to the repository.

A safe example environment file is provided at:

```text
apps/backend/.env.example
```

### Run the Backend

From the repository root:

```bash
npm run dev --workspace=backend
```

The backend API will start in development mode.

### Run the Frontend

In a separate terminal:

```bash
npm run dev --workspace=frontend
```

The Vite development server will start the frontend application.

## Code Quality and Linting

Before committing code or opening a Pull Request, ensure that the project passes the workspace linter:

```bash
npm run lint
```

Fix any linting errors before pushing changes.

## Documentation

Additional project documentation is available in the `docs` directory:

* `docs/index.md` — Documentation overview.
* `docs/setup.md` — Development setup instructions.
* `docs/architecture.md` — Application architecture.
* `docs/client-interactions.md` — Client and API interactions.

The project also includes an `mkdocs.yml` configuration file for the documentation site.

## Development Workflow

The project is developed using Git and Gitea.

A typical workflow is:

```bash
git pull
git switch <your-branch>
# Make changes
npm run lint
git add .
git commit -m "type: description"
git push
```

Commit messages should follow the team's agreed convention, for example:

```text
feat: add project creation
fix: correct entry validation
docs: update setup guide
test: add project creation tests
```

## Project Status

The project is currently under active development. The Basic requirements are being implemented first, with Intermediate and Advanced functionality planned for later stages.

The database schema and implementation will continue to evolve as the requirements for customisable project-specific entry formats are refined.
