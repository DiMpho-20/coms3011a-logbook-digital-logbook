# Report notes — migrations

Talking points for the written report, the demo and the viva. Each point is
backed by something in the repository.

## Why this is a feature and not housekeeping

The marker's question is usually "what did you design here?". The answer has
three moving parts that had to agree:

1. **A single source of truth for schema history** — the `0_init` baseline.
2. **A rule about when migrations run** — at deploy, before the API serves.
3. **A rule about which connection runs them** — the direct endpoint, not the
   pooler.

Each decision has a failure it prevents (drift, forgotten steps, P1002 hangs),
which is what makes it design rather than tidying up.

## Storyline for the report

1. The state found: migrations written on parallel branches, a schema that
   could not be reproduced from an empty database.
2. The options considered: keep appending (cheap, drift continues); reset with a
   destructive migration (loses data); squash into a baseline and make the
   workflow enforce itself (chosen).
3. The workflow: `start:deploy`, `DIRECT_URL`, CI database.
4. The proof: `migrate status`, CI runs, the nine dated migrations with their
   features.

## Likely viva questions

| Question | Short answer |
| --- | --- |
| What happens if a migration fails mid-deploy? | The container exits non-zero and does not serve; the schema stays at the last applied migration. Recovery is a forward fix. |
| Why no down-migrations? | Data loss on rollback is worse than a forward fix for this app; documented as a deliberate choice. |
| Why does the baseline not include the later folders? | It reproduces the schema as at the squash; later features are real, dated migrations so their history stays visible. |
| How do you know production matches `main`? | You don't, currently — production is the submitted snapshot (`79903cb`). `migrate status` on production would answer it; re-deploy is tracked as P2-3. |
| What if two people migrate at once? | Deploy runs one container; migrations are transactional per migration; the advisory lock serialises them. |

## Honest limitations

- No rollback path.
- The earlier squash means old clones must reset their database.
- Production lags `main` until re-deploy.
- The migration itself does not protect data at rest; that is covered
  separately by the 2FA/token encryption work and the Neon backup policy.

## Numbers to quote accurately

- 9 dated migration folders plus `0_init` under `apps/backend/prisma/migrations`.
- 7 of the 9 dated folders and the baseline were authored by Dineo; see the
  mapping table in `README.md` for hashes.
- Backend coverage at the 2026-11-25 audit: 85.17% lines across 45 suites
  (`docs/project/audits/audit-2026-11-25-full.md`).
