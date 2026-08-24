# @logbook/shared

Shared TypeScript types, Zod validation schemas, and interfaces consumed by both the frontend and backend of the Digital Logbook application.

## Purpose

This package eliminates type duplication across the monorepo and ensures the frontend and backend agree on data shapes. It is linked via npm workspaces (`"@logbook/shared": "*"`) and imported in both `apps/backend` and `apps/frontend`.

## Project Structure

```
packages/shared/
├── src/
│   ├── index.ts    # Response types, request types, error types, re-exports auth
│   └── auth.ts     # Zod validation schemas for authentication endpoints
└── package.json
```

## Exported Types

### Response Types

| Type | Description |
|---|---|
| `Project` | Project with id, name, description, status, timestamps |
| `ProjectWithFields` | Project with its associated entry fields |
| `EntryField` | Custom field definition (name, type, required flag) |
| `Entry` | Logbook entry with duration, dates, and field values |
| `EntryFieldValue` | Union type: `string \| number \| boolean \| null` |
| `TimeSummary` | Aggregate stats: total minutes/hours, entry count, last entry |

### Request / Input Types

| Type | Description |
|---|---|
| `CreateProjectInput` | Input for creating a project |
| `UpdateProjectInput` | Input for updating a project (partial) |
| `CreateEntryInput` | Input for creating an entry with field values |
| `UpdateEntryInput` | Input for updating an entry (partial) |
| `CreateEntryFieldInput` | Input for defining a new entry field |

### Enums

| Type | Values |
|---|---|
| `ProjectStatus` | `"ACTIVE"` \| `"ARCHIVED"` |
| `EntryFieldType` | `"TEXT"` \| `"NUMBER"` \| `"DATE"` \| `"BOOLEAN"` |

### Error Types

| Type | Description |
|---|---|
| `ApiError` | Standard error response shape (`{ error: string }`) |

## Auth Schemas (Zod)

All authentication Zod schemas and their inferred DTO types are exported from `src/auth.ts`:

| Schema | DTO Type | Purpose |
|---|---|---|
| `registerSchema` | `RegisterDto` | Registration (fullName, email, password with strength rules) |
| `loginSchema` | `LoginDto` | Login (email, password) |
| `forgotPasswordSchema` | `ForgotPasswordDto` | Request password reset (email) |
| `resetPasswordSchema` | `ResetPasswordDto` | Reset password (token, newPassword) |
| `deleteAccountSchema` | `DeleteAccountDto` | Delete account (confirmPassword) |
| `verifyEmailSchema` | `VerifyEmailDto` | Verify email (token) |
| `verifyTwoFactorSetupSchema` | `VerifyTwoFactorSetupDto` | Confirm 2FA setup (6-digit TOTP code) |
| `twoFactorLoginSchema` | `TwoFactorLoginDto` | 2FA login (email + 6-digit TOTP code) |
| `disableTwoFactorSchema` | `DisableTwoFactorDto` | Disable 2FA (password confirmation) |

## Usage

```typescript
import { Project, CreateProjectInput, registerSchema } from "@logbook/shared";
```

## Development

After modifying types in this package, restart both dev servers to pick up the changes:

```bash
npm run dev --workspace=backend
npm run dev --workspace=frontend
```

No build step is required — the package exports TypeScript source directly via `"main": "./src/index.ts"`.
