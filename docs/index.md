# Digital Logbook — Project Documentation

Welcome to the technical documentation for the **COMS3011A Digital Logbook** project.

## Quick Links
* **[Development Setup Guide](setup.md):** Local installation, Node/nvm requirements, and running dev servers[cite: 1].
* **[System Architecture](architecture.md):** Tech stack, monorepo layout, and database ERD[cite: 1].
* **[Project Methodology & Work Tracker](methodology.md):** Kanban workflow, user story assignments, and dependency tracking[cite: 1].
* **[Client Interaction Logs](client-interactions.md):** Requirements decisions and client meeting notes[cite: 1].

## Technical Stack Overview
* **Frontend:** React + Vite + TypeScript (running at `/apps/frontend`)[cite: 1]
* **Backend:** Node.js + Express + TypeScript (running at `/apps/backend`)[cite: 1]
* **Database:** PostgreSQL hosted on Neon using `pg` Pool driver[cite: 1]
* **Workspace:** Monorepo using npm workspaces[cite: 1]