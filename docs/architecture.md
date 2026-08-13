# System Architecture

## Database
* **Provider:** Neon PostgreSQL
* **ORM / Client:** `pg` Pool driver

## Frontend Proxy
Vite is configured to forward `/api/*` traffic to Express on `http://localhost:3000`.