# Screenshots to capture

Place captures here and reference them from `../README.md` or
`../report-notes.md`. Blur or crop any connection string, key or personal data.

- [ ] `01-migrate-status.png` — `npx prisma migrate status` showing
      "Database schema is up to date" and the applied list.
- [ ] `02-migrations-tree.png` — the `prisma/migrations` folder open:
      `0_init` + nine dated folders + `migration_lock.toml`.
- [ ] `03-start-deploy.png` — `package.json` (or a deploy log) showing
      `prisma migrate deploy && node dist/index.js`.
- [ ] `04-direct-url.png` — `prisma.config.ts` datasource selection, with any
      real URL blurred.
- [ ] `05-ci-run.png` — a green GitHub Actions run for the backend job,
      with the Postgres setup step visible.
- [ ] `06-fresh-database.png` — optional: a deploy against an empty database
      applying all migrations in order.
