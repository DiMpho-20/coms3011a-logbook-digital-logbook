# Dineo Motloung — individual additions

Module COMS3011A, group no-boys-just-bugs. This page records the work I did on
my own initiative, kept separate from the group coursework and from the
coursework roles I was assigned. It states what each addition is, why it was
needed, how it is built, and how a reader can verify it.

## What this page does and does not claim

- **Coursework, not claimed here.** The shared product was built by the group:
  authentication and 2FA, entries and formats, reminders and push
  notifications, My Grades, Google Calendar sync, the AI assistant, and the
  shared UI kit. None of that is claimed on this page.
- **My assigned coursework is elsewhere.** The expression engine and rule
  runner, the original redesign, and the Gitea pipeline were my coursework
  mandates; they are written up in `individual-report.tex` at the repository
  root and are not re-claimed here.
- **What this page claims.** Extra work beyond those mandates, mostly done
  after the coursework snapshot (`79903cb`, 11 October 2026): a second
  redesign round, automated deployment on GitHub, a coverage push, and
  post-submission hardening.

## How to read the evidence

- *(repo)* — verifiable from a tracked file or commit in this repository.
- *(uncommitted)* — present in the working tree at the time of writing
  (26 November 2026, HEAD `6f3d23f`); no commit is claimed for it.
- No secrets, connection strings or personal data appear on this page.

## At a glance

| Addition | State | Main evidence |
| --- | --- | --- |
| Automated deployment on GitHub | committed 26 Nov | `6f3d23f` — `.github/workflows/ci.yml`, `docs/setup.md` |
| Second redesign round: Today-first dashboard | uncommitted | `apps/frontend/src/pages/dashboard/`, `DashboardPage.tsx` |
| Sidebar re-skin and capture-first navigation | uncommitted | `apps/frontend/src/components/Sidebar.tsx`, `AppLayout.tsx` |
| One-line entry capture | uncommitted | `apps/frontend/src/components/EntryForm.tsx` |
| Frontend coverage push (81% → 90%) | uncommitted | 10 new test files, 939 tests |
| Security, sessions, paging, modularisation | committed 25 Nov | `d6f1df1`, `2fb9f73`, `7e1924b`, `83f083a` |
| Schema migrations as a feature | committed | `082e7f5`, `054c187`, CI database work |
| Audits, docs, report artefacts | committed + untracked | `docs/project/audits/`, `README.md`, `individual-report.tex` |

## 1. Automated deployment on GitHub

**Problem.** The pipeline could prove the app was healthy but stopped there.
A green run did not mean the site had changed, and nothing deployed the exact
bundle the tests had run against. A second audit finding was that a run with
no deploy credentials still looked successful.

**Design.** A `deploy` job in `.github/workflows/ci.yml`, after the `test` job:

| Decision | Reason |
| --- | --- |
| `needs: test` and `if: github.ref == 'refs/heads/main'` | Deploys only a revision that passed everything; never on pull requests |
| `curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL"` | Render rebuilds the API from `main`; the container's `start:deploy` applies migrations before serving |
| Frontend from a `frontend-dist` artifact | The published bundle is the one the tests ran against, not a second build |
| `wrangler pages deploy … --branch=main` | Production branch stays `main` on Cloudflare Pages |
| Health poll, 20 attempts × 15 s | The free Render tier sleeps; the first visitor should not pay the cold start |
| Each step gated on `env.X != ''` | The secrets context is unavailable in `if:`, so credentials are read through `env` |
| Final `always()` summary step | Writes which targets published, or that a target was skipped. Prevents "green but nothing deployed" |

**What is needed to publish.** Three GitHub repository secrets:
`RENDER_DEPLOY_HOOK_URL`, `CLOUDFLARE_API_TOKEN` (Cloudflare Pages: Edit) and
`CLOUDFLARE_ACCOUNT_ID`; optionally the variable `CLOUDFLARE_PAGES_PROJECT` if
the project is not `coms3011a-logbook`. Without them the run stays green and
the summary says both targets were skipped.

**Status and limitations.**

- Committed as `6f3d23f` and pushed to GitHub; the run it triggers is the
  first to exercise it. Until the secrets exist, the deploy steps skip and the
  summary says so.
- The MkDocs site on Netlify is untouched; whether it rebuilds from GitHub
  depends on Netlify's dashboard, which I did not guess at.
- Production still serves the coursework snapshot `79903cb`; none of the
  November work is live until a deploy runs.

**Verify.** `git show --stat 6f3d23f`, then read the `deploy` job and the
`State what this run deployed` step.

## 2. Second redesign round: Today-first dashboard

**Problem.** The dashboard had grown into a grid of panels whose value was
uneven: the student's first question is "what do I do today?", but capture and
today's work sat below secondary panels, and several panels repeated what
other pages already showed.

**Design.** The page now opens with what is actionable today, in this order:

1. A single-line capture card (`CaptureCard.tsx`) — see section 4.
2. Today (`TodayPanel.tsx`) with the daily note (`TodayNote.tsx`) carrying a
   gradient edge so it reads as part of the page's identity.
3. Due next (`DueNextPanel.tsx`), grades (`GradesPanel.tsx`) and momentum
   (`MomentumPanel.tsx`) as supporting panels.
4. A layout the student can change: `PanelGrid.tsx`, `ArrangeMenu.tsx`,
   `PanelPicker.tsx`, persisted through `usePanelLayout.ts` and the account's
   saved layout.
5. `WeekPill.tsx` for the week's position, and a subtitle that states the
   page's conclusion ("Nothing needs a nudge today" / "A few things need a
   look today") instead of a generic greeting.

**What was removed.** The previous `DailyNote`, `NextUp`, `OnYourRadar` and
`ModulesAtAGlance` panels, whose jobs are now done by the new panels without
duplicating other pages' content. Their CSS was deleted from `index.css`
rather than left behind.

**Tests.** `apps/frontend/src/pages/__tests__/DashboardPage.test.tsx` exercises
the panel set, the subtitle logic and the empty/first-use state.

**Status.** *(uncommitted)* — present in the working tree, not deployed.

## 3. Sidebar re-skin and capture-first navigation

**Problem.** The sidebar read as a list of links with icons and a dark rail;
it competed visually with the content, and the most common action — logging
work — was not available from it.

**Design.** A light rail with one accent (the gradient "DL" mark):

- Four groups that mirror what the student is doing: **Today** (Dashboard,
  Reminders, Calendar), **Work** (Projects, Entries, Open Work, Board,
  Statistics), **Academics** (My Grades), **Personal** (Profile, Settings).
- **New entry** at the top with the `N` keycap it mirrors, wired to the same
  `openQuickEntry` callback the keyboard shortcut uses (`AppLayout.tsx`), so
  there is one quick-entry path, not two.
- A dot per row; only the current page's dot is solid. `aria-current` comes
  from `NavLink`, so nested pages keep their section marked.
- A footer card with the signed-in student, avatar or initial, and log out.
- Collapsed mode (desktop) and the mobile drawer share the same component;
  the collapsed state persists in `localStorage`.

**Cleanup.** The dead dark-rail CSS (`--nav-accent`, `.sidebar-nav-active`,
`.sidebar-active-bar`, scrollbar rules) was deleted from `index.css` instead
of left as unused overrides.

**Tests.** `Sidebar.test.tsx` checks the group order, exactly one current
link, the nested-page case, the reminder badge, and the New entry button and
`N` keycap. `AppLayoutStatus.test.tsx` covers the collapse persistence and the
shell's status banners.

**Status.** *(uncommitted)*.

## 4. One-line entry capture

**Problem.** Logging work should cost one line, but the entry form showed the
project's every field at once. That made capture slow and pushed the dashboard
down.

**Design.** `EntryForm` gained a `minimal` mode used by the dashboard card:

- The first TEXT field is the visible line; duration is a small box beside it;
  Enter saves; Ctrl/Cmd+Enter always saves.
- Every other field (numbers, tags, checklists, links, references, computed
  values) waits behind a **Details** toggle, which is the same form, not a
  second one — the save path is unchanged.
- If a required field is hidden in Details, a refused save opens Details,
  shows the error and focuses the field instead of failing silently.
- The project selector carries a stable colour dot from
  `apps/frontend/src/lib/projectColors.ts`, and the form starts in the project
  last worked in (`lib/quickCapture.ts`), falling back to the first active one.
- Prefill carries forward within a project and is keyed by field type, so a
  field whose type changed does not inherit a stale value.

**Tests.** `EntryForm.test.tsx` covers the minimal layout, Enter-to-save, the
Details fold, and the hidden-required-field case, alongside the existing
per-type tests.

**Status.** *(uncommitted)*.

## 5. Frontend coverage push

**Problem.** The suite was green but thin in exactly the places that fail
quietly: route wiring, the error boundary, offline banners, auth flows and
the API wrapper layer.

**Result** (measured 26 November 2026 on this checkout):

| Measure | Before | After |
| --- | --- | --- |
| Test files | 55 | 65 |
| Tests | 839 | 939 |
| Lines | 81.17% | 90.43% (5 165 / 5 711) |
| Statements | 79.57% | 88.30% |
| Branches | 77.33% | 80.64% |
| Functions | 77.12% | 83.99% |

The line floor in the Vitest config remains 78%, so the margin is now
substantial rather than accidental.

**New test files** *(uncommitted)*:

| File | Covers |
| --- | --- |
| `src/__tests__/App.test.tsx` | Landing, unknown-path redirect, protected-route redirect |
| `src/__tests__/apiWrappers.test.ts` | History, archive, reminders, push, dashboard layout, statistics, queued-project branches |
| `src/components/__tests__/AnimatedBackground.test.tsx` | Canvas sizing, DPR cap, visibility loop, reduced motion, teardown |
| `src/components/__tests__/AppLayoutStatus.test.tsx` | Offline/syncing banners, sync errors, recovery notice, collapse persistence |
| `src/components/__tests__/ErrorBoundary.test.tsx` | Fallback, retry, child passthrough |
| `src/pages/__tests__/LoginPageInteractions.test.tsx` | Focus styles, password reveal, 2FA step switching, code sanitising |
| `src/pages/__tests__/RegisterPageFlows.test.tsx` | Success and failure submits, server error shapes, form interactions |
| `src/pages/project/__tests__/format.test.ts` | `relativeDay`, `dateHeading`, archive filter map |
| `src/pages/project/__tests__/useProjectEntries.test.tsx` | Load, grouping, archive, bulk actions, checklist optimism, recurrence |
| `src/pages/settings/__tests__/useTwoFactor.test.tsx` | Status, setup, disable, regenerate, copy/download recovery codes |

**Verify.**

```bash
cd apps/frontend
node ../../node_modules/vitest/vitest.mjs run --coverage
```

Expected: 65 files, 939 tests, lines ≈ 90.4%.

## 6. Post-submission hardening and scale work (committed)

These are committed on `main` after the coursework snapshot and are the parts
of the November work that are already in history:

| Area | What changed | Commit |
| --- | --- | --- |
| HTTP hardening | Helmet, JSON 404, global error handler, env-driven CORS allowlist (`apps/backend/src/app.ts`, `middleware/cors.middleware.ts`, `middleware/error.middleware.ts`) | `d6f1df1` |
| Revocable sessions | `sessionTokenVersion` on the user; tokens carry the version; logout revokes server-side (`middleware/auth.middleware.ts`, `utils/auth.ts`) | `2fb9f73`, `dab7ae7` |
| Read scaling | Project time summed in PostgreSQL; `/me/open-entries` paged; Open Work pages in the UI | `7e1924b`, `f6cf7fb` |
| Modularisation | Settings, dashboard, entries, project page and statistics split into hooks and section modules instead of one file each | `6f43df9`, `83f083a`, `25a9e1e`, `c9d6e98`, `8a008e3`, `00b93bd` |
| Build hygiene | Node engine floor, TypeScript strict mode, API base URL from `VITE_API_URL`, LICENSE, repository pointed at GitHub | `51436d6`, `f7707bd`, `c03b791`, `40edfa9` |
| CI | GitHub Actions pipeline: typecheck, lint, both suites with coverage floors against a provisioned Postgres, builds | `6ee1793` |

Server-side logout and session revocation are visible to a marker: log in on
two devices, log out on one, and the other's next request is refused.

## 7. Schema migrations as a feature

The workflow that takes an empty database to the deployed one without drift
or a forgotten manual step is documented in depth under
[`database-migrations/`](database-migrations/README.md), including the demo
script and report notes. It covers the `0_init` baseline, deploy-time
`migrate deploy`, the direct Neon endpoint for migrations, and the CI
database. The evidence table there lists the nine dated migrations and their
authors; three belong to teammates and are not claimed.

## 8. Audits, documentation and report artefacts

- **Audits**: `docs/project/audits/` — the September feature audit, the 25
  November full audit and its round-two follow-up, and the tracked status of
  the recommended work order. The round-two follow-up and status table are
  committed; the full November audit file is still untracked.
- **README rewrite** *(repo)*, `e6cecd1`: the root README now states the app's
  verified behaviour, configuration, scripts, testing and deployment instead
  of aspirational copy.
- **Setup documentation** *(repo)*, `6f3d23f`: the GitHub deploy paragraph and
  secret table in `docs/setup.md`, alongside the existing Render/Neon/Cloudflare
  instructions.
- **Individual evidence set** *(repo)*, `6f3d23f`: this folder — the migrations
  deep dive with its demo script, report notes and screenshot checklist.
- **Report artefacts** *(untracked)*: `individual-report.tex`, `main.bib` and
  the two testing-section sources used for the written report and the group
  testing chapter.

## Verify everything on this page

```bash
# what is committed
git log --oneline --author='Dineo' --since=2026-11-24

# what is still in the working tree
git status --short

# the suite and its coverage
cd apps/frontend
node ../../node_modules/vitest/vitest.mjs run --coverage

# the deploy job, once committed
grep -n 'deploy:' -A 20 .github/workflows/ci.yml
```

## Honest limitations

- The second redesign round, the sidebar re-skin, one-line capture and the
  coverage push (including the 10 new test files) are **uncommitted**. They are
  not in the deployed site, which still serves the coursework snapshot
  `79903cb`. Only the deploy job and the documentation are committed so far
  (`6f3d23f`).
- The deploy job publishes nothing until the three GitHub secrets exist; the
  run summary is designed to say so rather than hide it.
- The dashboard redesign was checked with the suite and a manual browser pass;
  no screenshots are committed yet. The checklist in
  `database-migrations/screenshots/README.md` describes the captures that are
  still to be taken.
- The frontend coverage figures are a point-in-time measurement of this
  checkout, not a guarantee that every branch is exercised.
