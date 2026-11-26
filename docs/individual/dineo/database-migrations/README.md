# Schema migrations as a feature

Owner: Dineo Motloung · Area: `apps/backend/prisma` and the deploy/CI pipeline
· Snapshot: 2026-11-25

## The problem

By Sprint 2 the repository had two failure modes around the database:

1. **Schema drift.** Several branches had written migrations against the same
   database in different orders, and a fresh clone could not reproduce the
   deployed schema from `prisma/migrations` alone.
2. **Migrations that hang in production.** Neon's pooled endpoint can split a
   migration's advisory lock across connections, so a deploy-time
   `prisma migrate deploy` could block and time out (Prisma P1002). A deploy
   that quietly stops halfway is worse than one that fails loudly.

Both were workflow problems, not schema problems, so the fix is a documented
workflow with one path from empty database to deployed API.

## The design

| Decision | Reason |
| --- | --- |
| Squash the history into a single `0_init` baseline | The deployed database already contained every change; a clean baseline makes `migrate deploy` reproduce it from scratch and ends the ordering drift |
| Commit `migration_lock.toml` | Prisma treats a missing lock file as a repair-worthy state; committing it makes the provider explicit and stops accidental regeneration |
| Run `prisma migrate deploy` from `start:deploy`, before the server listens | A deploy upgrades the schema itself; there is no separate step to forget, and the API never serves against an old schema |
| Point migrations at `DIRECT_URL` (direct endpoint, no `-pooler`) with `DATABASE_URL` as fallback | Migrations need one real connection; the application keeps using the pooled URL |
| Give CI its own PostgreSQL | Tests exercise the real migration path on every push, against a database nobody else is using |

## How it works

- `apps/backend/package.json` → `start:deploy`:
  `prisma migrate deploy && node dist/index.js`.
- `apps/backend/prisma.config.ts` → the migration datasource is
  `process.env.DIRECT_URL || process.env.DATABASE_URL`, so local runs need only
  `DATABASE_URL` while production sets both.
- `apps/backend/prisma/migrations/` holds `0_init` plus nine dated migrations.
  Each dated migration was authored alongside its feature; the baseline is the
  squashed history.

## Migration folders and the commit that introduced them

| Folder | First commit | Author |
| --- | --- | --- |
| `0_init` | `082e7f5` chore(prisma): squash the migration history into a 0_init baseline | Dineo |
| `20260927010000_push_notifications` | `a2aa72f` feat: push due reminders to subscribed devices | Wendy |
| `20260927020000_dashboard_layouts` | `c0f0a55` feat: save dashboard layouts to the account | Wendy |
| `20260927140000_unique_entry_field_names` | `c76eb8a` fix(entry-fields): enforce one field name per project | Dineo |
| `20260929120000_user_profile_fields` | `c83d931` feat(api): move the student's profile onto their account | Dineo |
| `20261005200000_my_grades` | `0dea059` feat(grades): add modules and assessments API | Dineo |
| `20261006090000_assessment_reminders` | `59c9797` feat(grades): remind students before dated assessments | Dineo |
| `20261006120000_saved_filters` | `43534ad` feat: keep saved filters on the account | Wendy |
| `20261125140000_session_token_version` | `2fb9f73` feat(auth): make session tokens revocable | Dineo |

Dineo also authored `054c187` (add the missing `migration_lock.toml`) and the
CI database work: `6ee1793` (GitHub Actions pipeline), `8c82d8f` (install
PostgreSQL in the job), `9f0065f` (run the suite against the long-lived
database). `b14fd5c` documents the `DIRECT_URL` reasoning in `docs/setup.md`.

## Verification

```bash
# Local: apply migrations exactly as a deploy would
cd apps/backend
DATABASE_URL=postgres://... npx prisma migrate deploy
npx prisma migrate status     # expect: "Database schema is up to date"

# History is intact
git log --oneline -- apps/backend/prisma/migrations

# CI proves the path on every push
# .github/workflows/ci.yml provisions postgres:16 and runs the backend suite
```

## Limitations, stated plainly

- There are no down-migrations. Recovery is restore-from-backup plus a forward
  fix; that is a deliberate trade for a course project, not an oversight.
- The baseline squash rewrote migration history. Every existing clone must
  reset its local database; teammates were told, but it is the reason the
  commit says "chore" and not "feat".
- The live deployment is the submitted snapshot (`79903cb`), so the newest
  migrations exist on `main` and in CI but not yet in production. This is
  tracked in `docs/project/audits/audit-2026-11-25-round2.md` (P2-3).
- Production also depends on a keep-warm pinger for the dormant Render free
  tier (`docs/setup.md`), which is unrelated to migrations but affects the
  first request after sleep.
