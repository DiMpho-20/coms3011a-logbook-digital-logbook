# Feature Audit — September 2026

**Repository:** `coms3011a-logbook-digital-logbook`
**Branch:** `Dineo` at `7d0af0a`, level with `origin/main`
**Date:** 2026-09-20
**Method:** code-level verification against the current working tree. Every verdict below was reached by reading the file named beside it, not by assumption. Runtime sections are marked where they still need a live pass.

---

## 1. Purpose

This audit establishes what works before the UI transformation begins, so that a regression introduced later can be told apart from a defect that was already there. It also re-checks the ten bugs and eight features recorded in `.gitea/issues/`, several of which the issue index still lists as Open despite recent merges.

## 2. Status of this audit

| Section | State |
|---|---|
| Code-level verification of every feature surface | Complete |
| Re-verification of the `.gitea/issues/` backlog | Complete |
| Performance baseline | Complete |
| Backend test suite (100 tests) | Pending — see §3 |
| Frontend test suite (65 tests) | Pending — see §3 |
| Manual runtime walkthrough | Pending |
| Live deployment probe | Pending |

## 3. Why the test suites are not yet recorded

The suites could not be run from either environment available to this audit. The organisation's egress policy returns 403 for `registry.npmjs.org` from both the isolated Linux workspace and the cloud container, so dependencies cannot be installed outside the existing Windows `node_modules`; and TCP to the Neon host on port 5432 is refused from both, so the backend integration suite could not reach the database in any case. The suites therefore run only on the development machine itself, where both the installed packages and the network path already exist. Counts will be recorded here once that run is done.

## 4. Backend

### 4.1 Access control — defect found

The entry API performs no ownership checks. This was not previously recorded in `.gitea/issues/` and is logged below as BUG-011.

In `src/controllers/entry.controller.ts`, `getEntries` queries `where: { projectId }` with no `userId` term; `createEntry` resolves the project with `findUnique({ where: { id: projectId } })` alone; `deleteEntry` and `updateEntryStatus` carry no ownership check at all; and `updateEntry` does read `project.userId`, but only to resolve tag ownership, never comparing it against `req.userId`. The routes in `src/routes/entry.routes.ts` are all wrapped in `requireAuth`, but that middleware establishes only that the caller holds a valid JWT — it does not establish that the caller owns the resource named in the path.

The same omission appears in `src/controllers/stats.controller.ts`, where `groupStats` and `timelineStats` are typed as plain `Request` rather than `AuthenticatedRequest` and so cannot read `req.userId` even in principle.

The practical consequence is that any authenticated account can read, modify, delete and aggregate another account's entries given an entry or project ID, and project IDs appear in the address bar on `/projects/:id`. `project.controller.ts` and `entryField.controller.ts` both scope their queries correctly by `userId`, which suggests an oversight in two files rather than a deliberate design.

### 4.2 Feature verdicts

| Area | File | Verdict |
|---|---|---|
| Health and DB check endpoints | `app.ts` | Works |
| Register, email verification, login, 2FA login, forgot/reset password, account deletion, 2FA setup/verify/disable/status | `routes/auth.routes.ts` | Present — runtime pass pending |
| Google Calendar connect, callback, status, sync, disconnect | `routes/googleCalendarRoutes.ts` | Present — runtime pass pending |
| Projects CRUD, status patch, time summary, per-user name uniqueness | `controllers/project.controller.ts` | Works, correctly scoped by `userId` |
| Entry fields create/read/update/soft-retire, format-version history | `controllers/entryField.controller.ts` | Works, correctly scoped by `userId` |
| All nine field types accepted and validated server-side | `utils/entryValues.ts` | Works — every type has a shape check |
| Computed-field formula evaluation and validation | `utils/computedFields.ts` | Works — character allowlist before evaluation, references restricted to NUMBER fields |
| Immutable format snapshots, computed-field backfill | `utils/entryFormat.ts` | Works, with the known race described below |
| Entry create/read/update/delete/status | `controllers/entry.controller.ts` | Works functionally — fails on authorisation, §4.1 |
| Statistics: totals, five operations, group-by, timeline bucketing | `controllers/stats.controller.ts` | Works functionally — fails on authorisation, §4.1 |
| Tags list and delete | `controllers/tag.controller.ts` | Works |

### 4.3 Migration history

`prisma/migrations/` contains only two directories, `20260908000000_entry_format_versions` and `20260920000000_add_tags`. There is no baseline migration covering the core eleven-model schema, which implies the original schema reached the database by `prisma db push` rather than by a migration. A fresh environment brought up with `prisma migrate deploy` would therefore not arrive at the current schema. This has no effect on the running system but is worth resolving before anyone treats the migration history as reproducible.

The tags migration exists locally. Whether it has been applied to the production Neon database — an open item from the 2026-09-18 client meeting — could not be checked here, because the database is unreachable from this environment.

## 5. Frontend

### 5.1 The seven documented gaps, re-checked

**Gap 1 — `EntryForm` renders only four of nine field types. Confirmed, and worse than recorded.** `components/EntryForm.tsx` handles TEXT, NUMBER, DATE and BOOLEAN. TAGS, CHECKLIST, LINK, REFERENCE and COMPUTED are absent. Beyond the recorded gap, the form also has no `entryDate` input, so backdating is unavailable through it, and it does not carry tags. Backdating and tagging exist only in the bespoke modal inside `ProjectDetailPage`.

**Gap 2 — no global quick entry. Confirmed.** `components/AppLayout.tsx` contains no New Entry control. A search across the entire frontend for `metaKey` or `ctrlKey` returns exactly one match, the Ctrl+Enter submit handler inside `EntryForm` itself. There is no Ctrl/Cmd+N and no command palette.

**Gap 3 — decorative sidebar effects. Confirmed, and they carry a measurable cost.** `components/Sidebar.tsx` writes a `radial-gradient` into an element's inline `style` on every mouse move, and renders five particle spans. `index.css` drives those through five infinite `@keyframes` animations plus a sixth on the avatar ring. Six permanently-running animations sit behind every page in the application, which is a plausible contributor to the client's report that the app feels slow.

**Gap 4 — dashboard structure. Partly confirmed.** `pages/DashboardPage.tsx` has the greeting, three stat cards, a deadline panel, an activity section, current projects, tags and recent entries. What the intended structure calls for and the page lacks is a New Entry action and format summaries on the project cards — `components/ProjectCard.tsx` makes no reference to fields at all.

**Gap 5 — no field builder on Project Detail. Confirmed.** `pages/ProjectDetailPage.tsx` renders an "Entry Format" heading but calls none of `createEntryField`, `updateEntryField` or `deleteEntryField`. All three are called only from `pages/ProjectsPage.tsx`, inside its edit modal.

**Gap 6 — due dates rely on colour. Partly refuted.** `components/EntryCard.tsx` already renders a textual "Overdue" badge, and `components/DeadlineReminders.tsx` and `pages/OpenWorkPage.tsx` both pair labels with `AlertTriangle` and similar icons. The real defect is not colour-dependence but duplication: there is no shared `DueDateBadge`, so each surface derives and renders urgency independently, and consistency across Entries, Dashboard, OpenWork, Board and Calendar is unverified.

**Gap 7 — statistics incomplete. Largely refuted.** Wendy's stats redesign closed most of this. `pages/StatsPage.tsx` offers a project selector, a metric field with all five operations, an optional group-by over any non-computed field, and a timeline with day/week/month buckets plotting either entry counts or the total of a numeric field. Two genuine gaps remain. First, the timeline requires the project to have a user-defined DATE field; a project without one cannot be plotted over time at all, even though every entry carries `entryDate` and `createdAt`. Second, the metric selector lists only NUMBER and COMPUTED fields, so although the backend accepts `count` over TEXT, TAGS and BOOLEAN fields, counting entries grouped by a text field is unreachable from the interface. The specification asks that any field its owner defines be something they can total, group by, compare and plot; those two restrictions are where it currently falls short.

### 5.2 Other feature surfaces

| Surface | File | Verdict |
|---|---|---|
| Timeline grouping, search, project filter, saved filters, tag filtering | `pages/EntriesPage.tsx` | Present — no search-match highlighting |
| Monthly calendar keyed on `entryDate` falling back to `createdAt` | `pages/CalendarPage.tsx` | Present |
| Board grouped by a chosen custom field | `pages/BoardPage.tsx` | Present |
| Overdue / today / soon / no-due-date buckets with completion | `pages/OpenWorkPage.tsx` | Present |
| Offline queue, auto-sync, banner | `lib/offlineEntries.ts`, `components/AppLayout.tsx` | Present |
| JSON export, JSON import, CSV export | `pages/SettingsPage.tsx` | Present |
| Session-expiry handling with credential-401 exemptions | `api/client.ts` | Correct — the exemption list covers login, 2FA login, account deletion and 2FA disable |

### 5.3 Theming — defect predicted

Dark mode is implemented in `index.css` as thirteen `[data-theme="dark"]` overrides covering `bg-white`, `bg-slate-50/100`, `border-slate-100/200`, the `text-slate-400` through `text-slate-900` range, one hover state and the form controls. Nothing else is themed.

A sweep of the colour utilities actually in use across `pages/` and `components/` finds `bg-red-50` in eighteen places, `border-red-200` in sixteen, `bg-blue-50` in twelve, `bg-emerald-50` in nine and `bg-amber-50` in four, none of which any override touches. Every error panel, deadline card, stat tile and tag chip built from those classes will keep its light background when the theme is switched. This is a prediction from the stylesheet rather than an observation, and it is the first thing to check on both themes during the runtime pass.

The same sweep shows the accent colour is currently split: `bg-blue-600` and its relatives appear about seventy times, while `text-cyan-600`, `text-cyan-700` and `text-cyan-400` appear fourteen times, concentrated in the sidebar and the statistics page. Consolidating on a single accent is a prerequisite for the calm working surfaces, not a cosmetic afterthought.

### 5.4 Accessibility

`prefers-reduced-motion` does not appear anywhere in the frontend. Six infinite animations run regardless of the viewer's motion preference. This is already a live accessibility defect against FEAT-006, before any of the planned motion work is added.

## 6. Performance baseline

Measured from the committed build in `apps/frontend/dist/assets`, dated 2026-09-20 14:54 UTC:

| Asset | Bytes | Approx. |
|---|---|---|
| `index-C9NAvquY.js` | 533,540 | 521 KB (~150 KB gzipped) |
| `index-DVfC3cdS.css` | 45,134 | 44 KB |

Every later bundle measurement is compared against these two numbers.

## 7. Issue backlog, re-verified

| ID | Recorded | Verified state |
|---|---|---|
| BUG-001 format-version race | Open | **Still open.** `utils/entryFormat.ts` reads the highest existing version and writes `version + 1` outside any transaction. |
| BUG-002 hardcoded JWT fallback | Open | **Still open.** `utils/auth.ts:4` — `process.env.JWT_SECRET \|\| "your-fallback-secret-key"`. |
| BUG-003 no rate limiting | Open | **Still open.** No rate-limit middleware in `app.ts`; no such dependency in `apps/backend/package.json`. |
| BUG-004 TOTP secrets plaintext | Open | **Still open.** `schema.prisma:43` stores `twoFactorSecret` as a plain `String`; no encryption anywhere in `auth.routes.ts`. |
| BUG-005 no 2FA recovery codes | Open | **Still open.** No recovery-code model and no endpoint. |
| BUG-006 2FA steps not linked | Open | **Still open.** `/login/2fa` is an independent request with no cryptographic link to the first step. |
| BUG-007 CI Node version mismatch | Open | **Still open.** `.gitea/workflows/deploy.yaml` pins `node-version: 20`; `.nvmrc` says `22`; the development machine runs 24. Not fixed by the earlier CI hardening. |
| BUG-008 stale Prisma client | Fixed | Agreed — the remaining risk is procedural, not code. |
| BUG-009 dashboard New Entry button | Fixed | Agreed — the button is gone. Note that the intended dashboard design wants the action back, in the layout header rather than on the page. |
| BUG-010 session-expiry redirect | Fixed | Agreed — `api/client.ts` handles it, and the credential-401 exemption list is correct. |
| **BUG-011 missing ownership checks** | **Not recorded** | **New. See §4.1.** Recommended as the highest priority in Phase C, above BUG-002, because it is exploitable by any logged-in account without any deployment misconfiguration. |

Of the feature requests, FEAT-001 (Google Calendar) is implemented and should move from Planned to Done pending a runtime check. FEAT-002 (field help text), FEAT-003 (view discoverability), FEAT-004 (pagination), FEAT-006 (accessibility) and FEAT-008 (responsive testing) remain open. FEAT-007 duplicates BUG-003 and should be closed as a duplicate.

## 8. Repository hygiene

Two observations that cost nothing to fix and will otherwise cause confusion.

The working tree is clean, but only when git is told `core.autocrlf=true`. Git for Windows sets that in its system configuration; environments that do not, including any Linux or CI checkout, see all 204 tracked files as modified. `git diff --ignore-cr-at-eol` is empty, confirming the difference is entirely line endings. A `.gitattributes` containing `* text=auto eol=lf` would remove the ambiguity permanently.

The MkDocs build output in `site/` is committed to the repository. It accounts for the bulk of the line-ending churn above and will conflict on any branch where two people have built the docs.

## 9. Recommended sequence

Phase C should lead with BUG-011, then BUG-002, then BUG-003, on the reasoning that BUG-011 needs no misconfiguration to exploit while BUG-002 does. The remainder of the recorded order stands.

Phase B should treat three items from this audit as prerequisites rather than polish: the dark-mode override set must be extended before any new coloured surface is introduced, a `prefers-reduced-motion` guard must exist before any motion is added, and the six always-on sidebar animations should be removed early, since they are a standing cost on every page and their removal is the cheapest available answer to the client's complaint about speed.
