# Frontend — Digital Logbook

The React single-page application for the Digital Logbook. Built with React 19, Vite 8, TypeScript, and Tailwind CSS v4.

## Tech Stack

| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 8 | Dev server and build tool |
| TypeScript 6 | Type safety |
| Tailwind CSS v4 | Utility-first styling with `@theme` directive |
| React Router v7 | Client-side routing with protected routes |
| Axios | HTTP client with JWT token interceptor |
| Lucide React | Icon library |
| Zod 4 | Client-side form validation |
| oxlint | Fast linting |

## Project Structure

```
apps/frontend/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── AppLayout.tsx   # Responsive shell: desktop sidebar + mobile drawer
│   │   ├── AuthLayout.tsx  # Full-screen wrapper with animated background
│   │   ├── AnimatedBackground.tsx  # Canvas-based particle and icon animation
│   │   ├── GlassCard.tsx   # Frosted-glass card for auth forms
│   │   ├── Sidebar.tsx     # Notion-style dark sidebar with glow effects
│   │   ├── ProtectedRoute.tsx  # JWT guard, redirects to /login if missing
│   │   ├── StatCard.tsx    # Dashboard metric card (6 color variants)
│   │   ├── ProjectCard.tsx # Project summary card
│   │   ├── EntryCard.tsx   # Entry card with overdue indicators
│   │   ├── EntryForm.tsx   # Dynamic entry creation/edit form
│   │   ├── Modal.tsx       # Accessible modal with backdrop
│   │   ├── PageHeader.tsx  # Consistent page title + action slot
│   │   ├── StatusBadge.tsx # Project status badge (ACTIVE/ARCHIVED)
│   │   ├── EmptyState.tsx  # Placeholder for empty lists
│   │   ├── ErrorState.tsx  # Error display with retry
│   │   ├── LoadingState.tsx # Spinner + loading text
│   │   └── LandingPage.tsx # Homepage with CTA
│   ├── pages/              # Route pages
│   │   ├── DashboardPage.tsx     # Greeting, stats, activity chart, projects, entries
│   │   ├── ProjectsPage.tsx      # Card grid/list, search, status filter
│   │   ├── ProjectDetailPage.tsx # Entry format, grouped entries, modal form
│   │   ├── EntriesPage.tsx       # Vertical timeline, filters, sort toggle
│   │   ├── SettingsPage.tsx      # Account, 2FA, theme, notifications, data
│   │   ├── ProfilePage.tsx       # Avatar, bio, degree, student number
│   │   ├── LoginPage.tsx         # Email + password login (with 2FA)
│   │   ├── RegisterPage.tsx      # Full name + email + password registration
│   │   ├── VerifyEmail.tsx       # Email verification via token link
│   │   ├── ForgotPasswordPage.tsx # Request password reset
│   │   └── ResetPasswordPage.tsx  # Reset password via token
│   ├── lib/
│   │   └── utils.ts        # Helpers: formatDuration, date, streak, greeting
│   ├── api/
│   │   └── client.ts       # Axios instance with JWT interceptor
│   ├── api.ts              # Typed API wrapper functions
│   ├── App.tsx             # Router config (public + protected routes)
│   ├── index.css           # Tailwind v4 theme and global styles
│   └── main.tsx            # Entry point
├── vite.config.ts          # Vite config with /api proxy to backend
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

> **Note:** The backend must also be running for API calls to work. The Vite config proxies `/api/*` requests to `http://localhost:3000`.

### 3. (Optional) Set API URL

Create `apps/frontend/.env` to override the default API URL:

```env
VITE_API_URL=http://localhost:3000/api
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run oxlint |

## Routing

### Public Routes (no auth required)

| Path | Page |
|---|---|
| `/` | Landing page |
| `/login` | Login |
| `/register` | Register |
| `/verify-email` | Email verification |
| `/forgot-password` | Request password reset |
| `/reset-password` | Reset password |

### Protected Routes (JWT required)

All protected routes are wrapped in `AppLayout` (sidebar + content area):

| Path | Page |
|---|---|
| `/dashboard` | Dashboard with stats and activity |
| `/projects` | Project list (grid/list view) |
| `/projects/:id` | Project detail with entries |
| `/entries` | Cross-project entry browser |
| `/settings` | Account and app settings |
| `/profile` | User profile |
