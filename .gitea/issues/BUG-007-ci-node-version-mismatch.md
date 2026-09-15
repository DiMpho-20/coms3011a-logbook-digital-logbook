# BUG-007: CI Node.js Version Mismatch

**Severity:** Medium
**Status:** Open
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
