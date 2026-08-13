# Development Setup Guide

## Prerequisites
* Node.js (v22+)
* npm (v10+)
* nvm (recommended)

## Quickstart
1. Clone the repository:
   ```bash
   git clone [https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook.git](https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook.git)
   cd coms3011a-logbook-digital-logbook

   Switch to the project's Node version:

Bash
nvm use
Install dependencies from the repository root:

Bash
npm install
Configure environment variables:
Create apps/backend/.env and add your database URL string:

Code snippet
DATABASE_URL="postgresql://<user>:<password>@<host>/<dbname>?sslmode=require"
Run development servers:

Backend: npm run dev --workspace=backend

Frontend: npm run dev --workspace=frontend

Code Quality & Linting
Before committing code or opening a Pull Request, always ensure your code passes the workspace linter:

Bash
npm run lint