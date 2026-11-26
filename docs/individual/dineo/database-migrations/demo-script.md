# Demo script — migrations, in four minutes

Assumes the repository is cloned and Postgres is running locally
(`docs/setup.md`, steps 1–5). Have two terminals open before you start.

## 1. Show the deployed schema path (60 s)

```bash
cd apps/backend
cat package.json | grep start:deploy
```

Say: a deploy does not need a manual migration step. `start:deploy` runs
`prisma migrate deploy` and the API only starts if the schema is current.

```bash
npx prisma migrate status
```

Expected: `Database schema is up to date!` plus the applied migration list.

## 2. Show that history is reproducible (90 s)

```bash
git log --oneline -- prisma/migrations | head
ls prisma/migrations
```

Point at `0_init` and the nine dated folders. Say: the baseline reproduces the
deployed schema from empty; the dated migrations each ship with the feature
that needed them.

Optional, if a spare empty database exists:

```bash
DATABASE_URL=postgres://logbook:logbook@127.0.0.1:55433/logbook_fresh \
  npx prisma migrate deploy
```

Expected: every migration applies in order without manual steps.

## 3. Show the pooling fix (60 s)

```bash
grep -n "DIRECT_URL\|DATABASE_URL" prisma.config.ts
```

Say: migrations use the direct Neon endpoint because the pooler can split the
advisory lock (P1002) and hang a deploy. The app still uses the pooled URL.

## 4. Show CI proving it (45 s)

Open the GitHub Actions run: the job installs PostgreSQL, applies migrations
and runs the backend suite. Point at one green run and the test count.

## 5. Close (15 s)

One sentence: the feature is a workflow — baseline, deploy-time migration,
direct endpoint, CI database — with each dated migration owned by the feature
that introduced it.

## Fallbacks

- No local database: stop after step 3; show a previous CI run for step 4.
- Render is asleep: use the health endpoint once, then wait; do not demo the
  API cold start as if it were a migration problem.
- Questions about rollback: answer from `report-notes.md`, limitations section.
