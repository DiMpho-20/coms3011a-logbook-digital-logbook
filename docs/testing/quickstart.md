# Testing Quickstart

The short version, for anyone adding a feature: **a feature is not done until
it has a test file, the suite is green, and coverage stays above 50%.** The
full story is on the [Testing](strategy.md) page.

## 1. Add a test file for your feature

- **Backend** → `apps/backend/src/__tests__/yourFeature.test.ts` — exercise the
  real API with supertest (copy the structure of `api.test.ts`).
- **Frontend** → `apps/frontend/src/**/__tests__/YourFeature.test.tsx` — render
  the real component with React Testing Library (copy the structure of
  `pages/__tests__/ProjectsPage.test.tsx`).

Cover the happy path and the obvious failure path (invalid input, missing
auth), and clean up any data the test creates.

## 2. Run it

From the repository root:

```bash
# just your file, while you are working on it
npm run test --workspace=apps/backend -- src/__tests__/yourFeature.test.ts
npm run test --workspace=apps/frontend -- src/pages/__tests__/YourFeature.test.tsx

# the full suite, before you push
npm run test --workspace=apps/backend
npm run test --workspace=apps/frontend
```

## 3. See coverage in the terminal

Run the suite with coverage:

```bash
npm run test:coverage --workspace=apps/backend
npm run test:coverage --workspace=apps/frontend
```

The end of the output is a table. Read the `All files` row — the last number
is **% Lines**, the number coverage is measured on. Backend example, from the
2026-10-11 run:

```text
File      | % Stmts | % Branch | % Funcs | % Lines
All files |   84.23 |    79.79 |    92.7 |   85.16
```

## 4. The 50% rule

The project **must stay above 50% combined coverage** — that is the figure the
marking rubric reads. Where it stands (coverage measured 2026-10-11, when the
suite ran 1,616 tests; it now runs 1,646):

| Workspace | % Lines |
|---|---|
| Backend | 85.16% |
| Frontend | 80.53% |
| **Combined** | **82.10%** (6,819 of 8,306 lines) |

CI also enforces its own floors: the backend fails below 80% of lines and the
frontend below 78%. The frontend is the lower of the two, so untested frontend
code is what will trip a floor first — test the code you add. After you push, CI runs both suites and publishes
`coverage/backend`, `coverage/frontend` and `coverage/combined` on your
commit in Gitea; a red run blocks the merge.
