# Third-Party Code

This page documents every third-party library and external service the
Digital Logbook depends on, and — more importantly — **why** each one was
chosen. Our policy is to lean on well-maintained, permissively licensed
libraries for solved problems (authentication primitives, email, build
tooling) while hand-writing everything that is core to the product
(the REST API, business logic, database schema and UI components).

Every package below is declared in `package.json` (per workspace) and its
license was verified from the installed `package.json` on disk.

## How we evaluate dependencies

Before adding a library we check:

1. **Fit** — does it solve a problem we would otherwise hand-roll poorly
   (crypto, date handling, bundling)?
2. **Maintenance** — is it actively maintained and widely adopted?
3. **License** — permissive (MIT / BSD / Apache-2.0) so it is safe for a
   university project; no copyleft surprises.
4. **Size** — is the dependency worth its footprint on the bundle?

## Backend runtime dependencies

| Package | License | What it does | Why we chose it |
|---|---|---|---|
| [express](https://expressjs.com) ^5.2 | MIT | HTTP framework for the REST API | Minimal and unopinionated — the course requires a *hand-written* API, and Express gives us routing/middleware without generating code or hiding the API behind heavy abstractions. v5 has native async error handling. |
| [@prisma/client](https://www.prisma.io) ^7.9 | Apache-2.0 | Type-safe database access | The generated client turns every query into TypeScript-checked code — schema drift becomes a compile error, not a runtime crash. Schema-as-code also gives us reviewable migrations. |
| [@prisma/adapter-pg](https://www.prisma.io) ^7.9 | Apache-2.0 | Driver adapter for PostgreSQL | Prisma's driver-adapter pattern lets us bring our own `pg` connection pool, which is the recommended way to talk to Neon's serverless Postgres over a pooled connection string. |
| [pg](https://node-postgres.com) ^8.23 | MIT | PostgreSQL wire-protocol driver | Required by the Prisma adapter; a mature, battle-tested driver. |
| [zod](https://zod.dev) ^4.4 | MIT | Schema validation | One validation library shared by frontend and backend through `@logbook/shared` — the same Zod schema validates the register form in React *and* the request body on the server. Single source of truth, no drift. |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) ^9.0 | MIT | Signs and verifies JWTs | Stateless auth: the server issues a signed token and verifies it on every request without a session store. The de-facto standard library for HS256 JWTs in Node. |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) ^3.0 | BSD-3-Clause | Password hashing | Pure-JavaScript bcrypt. We chose it over the native `bcrypt` package specifically because it needs no compilation — no node-gyp/native-module issues on teammates' Windows laptops. Same algorithm, identical hashes. |
| [otplib](https://github.com/yeojz/otplib) ^13.5 | MIT | TOTP two-factor authentication (RFC 6238) | Implements the same standard that Google Authenticator / Authy use, so users can use any authenticator app. Actively maintained successor to `speakeasy`. |
| [qrcode](https://github.com/soldair/node-qrcode) ^1.5 | MIT | QR code generation | Renders the `otpauth://` provisioning URI as a QR data URL so users can scan it with their phone camera instead of typing a base32 secret. |
| [nodemailer](https://nodemailer.com) ^9.0 | MIT-0 | Transactional email over SMTP | Works with any SMTP provider — we send through Gmail with an app password — so there is no vendor lock-in and it works in local development without an API account. |
| [cors](https://github.com/expressjs/cors) ^2.8 | MIT | Cross-Origin Resource Sharing middleware | The frontend (Vite dev server on :5173, deployed frontend on Cloudflare Pages) calls the backend on a different origin; `cors` handles the preflight/OPTIONS dance correctly. |
| [dotenv](https://github.com/motdotla/dotenv) ^17.4 | BSD-2-Clause | Loads `.env` into `process.env` | Twelve-factor configuration: secrets (DB URL, JWT secret, Gmail credentials) stay out of the codebase. |
| [resend](https://resend.com) ^6.20 | MIT | Email API client | **Installed but not yet wired up.** Being evaluated for the Sprint 2 external-API integration requirement as a possible replacement for raw SMTP sending. |

## Frontend dependencies

| Package | License | What it does | Why we chose it |
|---|---|---|---|
| [react](https://react.dev) ^19.2 + react-dom | MIT | UI component runtime | Component model fits the app (many reusable cards, forms, modals); the team knows it best; huge ecosystem. |
| [react-router-dom](https://reactrouter.com) ^7.18 | MIT | Client-side routing | declarative route tree with route guards — our `ProtectedRoute` wrapper redirects unauthenticated visitors to `/login`. |
| [axios](https://axios-http.com) ^1.19 | MIT | HTTP client | Chosen over `fetch` for its **request/response interceptors**: one interceptor attaches the JWT to every call, another catches 401s (expired session) and redirects to login. Automatic JSON parsing is a bonus. |
| [lucide-react](https://lucide.dev) ^1.31 | ISC | Icon library | Consistent, stroke-based icon set that tree-shakes — we import only the icons each page uses, so the cost per icon is tiny. |
| [zod](https://zod.dev) ^4.4 | MIT | Client-side form validation | Same schemas as the backend (see above) — the register/login forms validate with the exact rules the server will enforce. |

## Shared package (`@logbook/shared`)

| Package | License | Purpose |
|---|---|---|
| [zod](https://zod.dev) ^4.4 | MIT | The validation library the shared auth schemas are written in. This package is the reason the frontend and backend can never disagree about what a valid registration looks like. |

## Development tooling (devDependencies)

| Package | License | Where | Why |
|---|---|---|---|
| [typescript](https://www.typescriptlang.org) ^6.0 | Apache-2.0 | everywhere | Type safety across the monorepo; `tsc --noEmit` typechecks CI and every commit. |
| [vite](https://vite.dev) ^8.2 | MIT | frontend | Instant HMR in development and optimised, hashed-asset production builds. |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) ^6.0 | MIT | frontend | Fast Refresh + JSX transform for React under Vite. |
| [tailwindcss](https://tailwindcss.com) ^4.3 + postcss + autoprefixer | MIT | frontend | Utility-first CSS keeps styling inside the components; v4 compiles away unused styles. Responsive prefixes (`sm:`, `lg:`) are how the app meets the responsive-design requirement. |
| [tsx](https://github.com/privatenumber/tsx) ^4.23 | MIT | backend | Runs TypeScript directly in `npm run dev` with watch mode — no separate build step while developing the API. |
| [vitest](https://vitest.dev) ^4.1 | MIT | backend | Test runner with native TypeScript/ESM support and a Jest-compatible API; runs our 78 integration tests. See [Testing](testing.md). |
| [supertest](https://github.com/ladjs/supertest) ^7.2 | MIT | backend | Lets tests fire real HTTP requests at the actual Express app (through the real auth middleware and Zod validation), rather than calling handlers with fake request objects. |
| [eslint](https://eslint.org) ^10 + typescript-eslint ^8 | MIT | backend | Lints the backend with TypeScript-aware rules. |
| [oxlint](https://oxc.rs) ^1.75 | MIT | frontend | Rust-based linter — fast enough to run on every save. |

## External services

| Service | Role | Why |
|---|---|---|
| [Neon](https://neon.tech) | Hosted PostgreSQL | Serverless Postgres with autoscaling and a generous free tier; branching would let us copy the database for experiments. Chosen over self-hosting so the team never maintains a DB server. |
| Gmail SMTP | Transactional email | Verification and password-reset emails are sent through a Gmail account with an app password — zero cost, no signup friction, and it works locally. |
| [Render](https://render.com) | Backend hosting | Deploys the Express API from `main` with a free tier that suits a student project. |
| [Cloudflare Pages](https://pages.cloudflare.com) | Frontend + docs hosting | Global CDN for the built React app and this MkDocs documentation site. |
| Gitea (sdp.ms.wits.ac.za) | Version control, CI, issue tracker | University-hosted Git server; runs the CI workflow on every push and hosts the bug tracker we use for all defects. |

## Licensing summary

All dependencies use permissive licenses — MIT, BSD-2-Clause, BSD-3-Clause,
ISC, Apache-2.0 or MIT-0. There is no copyleft (GPL/AGPL) code in the
dependency tree, so the project's own licensing is unaffected.
