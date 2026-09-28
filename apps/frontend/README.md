# Frontend — Digital Logbook

The React single-page application for the Digital Logbook. Built with React 19, Vite 8, TypeScript, and Tailwind CSS v4, and deployed as a static build on Cloudflare Pages.

## Tech Stack

| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 8 | Dev server and build tool |
| TypeScript 6 | Type safety |
| Tailwind CSS v4 | Utility-first styling with `@theme` directive |
| React Router v7 | Client-side routing with protected routes |
| Axios | HTTP client with JWT and expired-session interceptors |
| Lucide React | Icon library |
| Zod 4 | Client-side form validation (schemas shared with the backend) |
| Service worker (`public/sw.js`) | Offline app shell and push notifications |
| Vitest + Testing Library + jsdom | Component, page and library tests |
| oxlint | Fast linting |

## Project Structure

```
apps/frontend/
├── public/
│   ├── sw.js                # Service worker: offline shell, push notifications
│   ├── favicon.svg
│   ├── icons.svg
│   └── ProjectLogo.png
├── src/
│   ├── pages/               # One component per route (see Routing below)
│   ├── components/          # Reusable UI and feature widgets, including:
│   │   ├── AppLayout.tsx, Sidebar.tsx      # Shell: sidebar + content, due-reminder count
│   │   ├── ProtectedRoute.tsx              # Redirects to /login without a token
│   │   ├── EntryForm.tsx, Stopwatch.tsx    # Entry capture with a live timer
│   │   ├── ChecklistInput.tsx, TagInput.tsx
│   │   ├── EntryHistoryModal.tsx           # Version history, view as of a date, restore
│   │   ├── AutomationRules.tsx             # A project's automation rules
│   │   ├── DeadlineReminders.tsx           # Upcoming and overdue work
│   │   ├── GoogleCalendarSync.tsx          # Connect and sync Google Calendar
│   │   ├── BarChart.tsx, TrendChart.tsx, WeekComparison.tsx
│   │   ├── DeleteProjectModal.tsx
│   │   └── …card, modal, header and state components
│   ├── lib/
│   │   ├── offlineCache.ts, offlineEntries.ts, offlineProjects.ts  # Offline layer
│   │   ├── reminderNotifications.ts        # In-app and push reminder notifications
│   │   ├── dashboardPreferences.ts, dashboardInsights.ts           # Dashboard panels
│   │   ├── savedFilters.ts, formulas.ts, tagColors.ts
│   │   └── utils.ts                        # Formatting, dates, streaks, greeting
│   ├── api/
│   │   └── client.ts        # Axios instance and interceptors
│   ├── api.ts               # Typed wrapper for every API call
│   ├── App.tsx              # Router config (public + protected routes)
│   ├── index.css            # Tailwind v4 theme, dark mode, reduced motion
│   └── main.tsx             # Entry point; registers the service worker in production
├── vite.config.ts           # /api proxy to the backend; alias for @logbook/shared; Vitest config
├── package.json
└── tsconfig.json
```

## Getting Started

### 1. Install dependencies

From the repository root:

```bash
npm install
```

### 2. Start the dev server

From the repository root:

```bash
npm run dev --workspace=frontend
```

The frontend will be available at `http://localhost:5173`.

> **Note:** The backend must also be running. In development, Vite proxies `/api/*` to `http://localhost:3000`. If the backend is not running, the Vite terminal logs `http proxy error … ECONNREFUSED` and the login page reports "Invalid email or password." even for correct details.

### Where the API is

`src/api/client.ts` chooses the API address by build mode, with no environment variable to set:

* **Development** (`npm run dev`): `/api`, proxied to the local backend.
* **Production build** (`npm run build`): the Render backend, `https://digital-logbook-backend-latest.onrender.com/api`.

### Push notifications in development

The service worker is only registered in a production build, so under `npm run dev` reminder notifications are in-app only: they appear while a logbook tab is open, checked every five minutes. To try real push, use the deployed site. (A local `npm run preview` build talks to the Render backend, whose CORS settings only accept the deployed site and the dev server's `localhost:5173`, so it cannot sign in.)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run test` | Run the test suite (no backend needed; the API is mocked) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with a coverage report |
| `npm run lint` | Run oxlint |

## Routing

### Public Routes (no auth required)

| Path | Page |
|---|---|
| `/` | Landing page |
| `/login` | Login, with 2FA and recovery codes |
| `/register` | Register |
| `/verify-email` | Email verification |
| `/forgot-password` | Request password reset |
| `/reset-password` | Reset password |

### Protected Routes (JWT required)

All protected routes are wrapped in `AppLayout` (sidebar + content area):

| Path | Page |
|---|---|
| `/dashboard` | Chosen and arranged dashboard panels, including saved statistics |
| `/projects` | Project list (grid/list view) |
| `/projects/:id` | Project detail: entries, entry format, automation rules |
| `/entries` | Cross-project entry browser: search, filters, saved filters, archive |
| `/open-work` | Unfinished entries grouped by urgency |
| `/stats` | Statistics, custom expressions and saved statistics |
| `/calendar` | Entries by due date, Google Calendar sync |
| `/board` | Entries as a board |
| `/reminders` | Reminders and reminder rules |
| `/settings` | Account, 2FA, theme, notifications, data export/import |
| `/profile` | User profile |

Unknown paths redirect to `/`.
