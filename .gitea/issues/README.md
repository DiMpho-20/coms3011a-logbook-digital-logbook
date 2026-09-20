# Issue Tracker

This directory contains all known bugs and feature requests for the Digital Logbook project, organised by category. These issues are intended to be migrated to the [Gitea issue tracker](https://sdp.ms.wits.ac.za/no-boys-just-bugs/coms3011a-logbook-digital-logbook/issues) when the team is ready to triage them.

## Bugs (15)

| ID | Title | Severity | Status |
|---|---|---|---|
| BUG-001 | [Concurrent Entry-Field Creation Race Condition](BUG-001-concurrent-entry-field-race.md) | High | Open |
| BUG-002 | [Hardcoded JWT Secret Fallback](BUG-002-hardcoded-jwt-secret.md) | Critical | Fixed |
| BUG-003 | [No Rate Limiting on Auth Endpoints](BUG-003-no-rate-limiting.md) | High | Open |
| BUG-004 | [TOTP Secrets Stored Unencrypted](BUG-004-unencrypted-totp-secrets.md) | High | Open |
| BUG-005 | [No 2FA Recovery/Backup Codes](BUG-005-no-2fa-recovery-codes.md) | High | Open |
| BUG-006 | [2FA Login Steps Not Cryptographically Linked](BUG-006-2fa-steps-not-linked.md) | Medium | Open |
| BUG-007 | [CI Node.js Version Mismatch](BUG-007-ci-node-version-mismatch.md) | Medium | Open |
| BUG-008 | [Stale Prisma Client Breaks Tests](BUG-008-stale-prisma-client.md) | Medium | Fixed |
| BUG-009 | [Dashboard "New Entry" Button](BUG-009-dashboard-new-entry-button.md) | Medium | Fixed |
| BUG-010 | [Session Token Expiry Redirect](BUG-010-session-expiry-redirect.md) | Medium | Fixed |
| BUG-011 | [No Ownership Checks on the Entry and Statistics APIs](BUG-011-missing-ownership-checks.md) | High | Fixed |
| BUG-012 | [Blank Numeric Field Breaks Every Aggregation](BUG-012-blank-numeric-breaks-stats.md) | High | Fixed |
| BUG-013 | [Duplicate React Keys in the Project Field Editor](BUG-013-duplicate-react-keys-field-editor.md) | Medium | Fixed |
| BUG-014 | [List Views Fan Out One Request Per Project](BUG-014-n-plus-one-list-views.md) | Medium | Fixed |
| BUG-015 | [No Delete-Project Endpoint](BUG-015-no-delete-project-endpoint.md) | Low | Open |

## Feature Requests (8)

| ID | Title | Priority | Status |
|---|---|---|---|
| FEAT-001 | [Google Calendar API Integration](FEAT-001-google-calendar-integration.md) | Medium | Partial |
| FEAT-002 | [Entry-Field Help Text](FEAT-002-entry-field-help-text.md) | High | Open |
| FEAT-003 | [View Discoverability](FEAT-003-view-discoverability.md) | Medium | Open |
| FEAT-004 | [API Pagination](FEAT-004-api-pagination.md) | Medium | Open |
| FEAT-005 | [Advanced Notifications](FEAT-005-advanced-notifications.md) | Low | Planned |
| FEAT-006 | [Accessibility (WCAG)](FEAT-006-accessibility-wcag.md) | Medium | Open |
| FEAT-007 | [Rate Limiting](FEAT-007-rate-limiting.md) | High | Duplicate (BUG-003) |
| FEAT-008 | [Responsive Design Testing](FEAT-008-responsive-design.md) | Low | Open |

## Sources

Issues were identified from:
- **Code scan**: TODOs, security patterns, missing error handling
- **AUTHENTICATION.md**: 5 documented known limitations (BUG-002 through BUG-006)
- **TESTING.md**: Bugs found during test development (BUG-001, BUG-008)
- **Commit history**: Bugs fixed in Sprint 2 (BUG-009, BUG-010)
- **User feedback (SUS Round 1)**: Entry-field confusion (FEAT-002), view discoverability (FEAT-003)
- **Client interactions**: Google Calendar (FEAT-001), notifications (FEAT-005), accessibility (FEAT-006)
- **CI/CD audit**: Node version mismatch (BUG-007)
- **Feature audit, 2026-09-20** (`docs/feature-audit-2026-09.md`): BUG-011 through BUG-015, found by code review and a manual walkthrough

## Issue Templates

Templates for creating new issues are in `.gitea/issue_template/`:
- `bug.md` — Bug report template
- `feature.md` — Feature request template
