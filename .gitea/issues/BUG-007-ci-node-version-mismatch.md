# BUG-007: CI Node.js Version Mismatch

**Severity:** Medium
**Status:** Fixed
**Component:** CI/CD — `.gitea/workflows/deploy.yaml`
**Labels:** bug, ci, configuration

## Bug Description
The Gitea Actions CI workflow uses Node.js 20, but the project specifies Node.js 22 in `.nvmrc`. This means code that works locally may fail in CI (or vice versa) due to differences in Node.js behaviour between versions.

## Steps to Reproduce
1. Check `.nvmrc` — it specifies Node.js 22
2. Check `.gitea/workflows/deploy.yaml` line 17 — it uses `node-version: 20`
3. A feature relying on Node 22 APIs could pass locally but fail in CI

## Expected Behaviour
CI should use the same Node.js version as specified in `.nvmrc` to ensure consistency.

## Actual Behaviour
CI uses Node 20 while local development uses Node 22.

## Environment
- **File:** `.gitea/workflows/deploy.yaml` (line 17)
- **File:** `.nvmrc`

## Proposed Fix
Change the CI workflow to read from `.nvmrc`:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'
```

Or hardcode `node-version: 22` to match.

## Resolution

`.gitea/workflows/deploy.yaml` reads the version from the repository instead of
repeating it: the setup step now uses `node-version-file: '.nvmrc'`, and
`.nvmrc` contains `22`. The hard-coded `node-version: 20` the report describes
no longer exists in the file.

This also fixed a real failure rather than a hypothetical one. The frontend
suite was failing wholesale in CI with
`webidl.util.markAsUncloneable is not a function`, raised from jsdom through
undici: `jsdom@30` requires Node `^22.22.2` and `undici@8` requires
`>=22.19.0`, so on the runner's Node 20 the whole suite could not start. It
passed locally because local development already used Node 22 — which is
exactly the divergence this issue described.

This entry stayed open after the code was fixed. Recording that here rather
than quietly flipping the status: a tracker that carries a fixed bug as open is
its own small defect.
