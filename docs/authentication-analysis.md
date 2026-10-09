# Authentication: Legal Liabilities, Precautions, and Trade-offs

**Project:** Digital Logbook (COMS3011A)
**Date:** 9 October 2026

---

## 1. Introduction and scope

This document analyses the authentication system implemented in the Digital
Logbook, covering three areas required by the project brief:

1. The legal liabilities of handling user credentials and personally
   identifiable information.
2. The precautions the implementation takes to reduce those liabilities.
3. The trade-offs between our self-hosted approach and a third-party identity
   provider such as Auth0 or Google Sign-In.

The brief requires that we *"may not write your own authentication system"*
and must *"rely on established practices and libraries."* Every credential
operation in this project is delegated to a mature library. Nothing in the
authentication code implements cryptographic primitives itself. This document
demonstrates that compliance and explores its consequences.

---

## 2. System overview

### 2.1 Stack

| Concern | Library | Purpose |
| --- | --- | --- |
| Password hashing | `bcryptjs` | Slow, adaptive hashing with per-password salt |
| Session tokens | `jsonwebtoken` | Stateless JWT signed with HMAC-SHA256 |
| TOTP 2FA | `otplib` | Time-based one-time password generation and verification |
| QR provisioning | `qrcode` | Encode the `otpauth://` URI as a scannable image |
| Email delivery | `nodemailer` (Gmail SMTP) | Send verification, reset and deletion-scheduled emails |
| Rate limiting | `express-rate-limit` | Throttle sensitive endpoints |
| Persistence | Prisma + PostgreSQL (Neon) | Store users and their data |

### 2.2 Data model (authentication-adjacent)

From `schema.prisma`:

**`User`** — the record every credential decision hangs off:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key, never exposed as a JWT claim alone |
| `email` | `varchar(255)` unique | Used as the account identifier at sign-in |
| `password_hash` | `varchar(255)` | A bcrypt digest, never the plain password |
| `full_name` | `varchar(255)` | |
| `is_email_verified` | `boolean` | Login is refused until true |
| `email_verification_token` | `varchar(255)` nullable | SHA-256 digest of the emailed token |
| `email_verification_expiry` | `timestamp` nullable | One hour from issue |
| `two_factor_secret` | `varchar(255)` nullable | Encrypted TOTP secret (see §4.4) |
| `is_two_factor_enabled` | `boolean` | |
| `scheduled_deletion_at` | `timestamp` nullable | Set when the user schedules deletion |
| `bio`, `avatar`, `student_number`, `degree`, `year_of_study` | various | Profile fields, all optional |
| `created_at`, `updated_at` | `timestamp` | |

**`PasswordReset`** — one row per reset request:

| Column | Notes |
| --- | --- |
| `token_hash` | SHA-256 digest of the emailed token, never the raw value |
| `expires_at` | One hour from issue |
| `user_id` | Cascade delete when the user is removed |

**`TwoFactorRecoveryCode`** — one row per issued code:

| Column | Notes |
| --- | --- |
| `code_hash` | SHA-256 digest of the code |
| `used_at` | Null until spent; spent codes are kept so "3 of 10 remaining" stays answerable |

Recovery codes are deleted when 2FA is disabled or regenerated.

### 2.3 Endpoints

From `auth.routes.ts`:

| Method | Path | Middleware | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `registerLimiter` | Create an account, send verification email |
| POST | `/api/auth/verify-email` | — | Consume a verification token |
| POST | `/api/auth/login` | `loginLimiter` | Password check, issue JWT (or 2FA pending token) |
| POST | `/api/auth/login/2fa` | `twoFactorLimiter` | Complete a 2FA sign-in |
| POST | `/api/auth/forgot-password` | — | Issue a password reset token |
| POST | `/api/auth/reset-password` | — | Consume a reset token, change the password |
| DELETE | `/api/auth/account` | `requireAuth` | Schedule deletion with a 30-day grace period |
| POST | `/api/auth/account/cancel-deletion` | `requireAuth` | Cancel a scheduled deletion |
| POST | `/api/auth/2fa/setup` | `requireAuth` | Generate a TOTP secret and QR code |
| POST | `/api/auth/2fa/verify-setup` | `requireAuth` | Confirm the code, enable 2FA, issue recovery codes |
| POST | `/api/auth/2fa/disable` | `requireAuth` | Turn 2FA off after a password check |
| GET | `/api/auth/2fa/status` | `requireAuth` | Report 2FA state and remaining recovery codes |
| POST | `/api/auth/2fa/recovery-codes` | `requireAuth` | Regenerate recovery codes after a password check |

---

## 3. Legal liabilities

### 3.1 Protection of Personal Information Act (POPIA)

The Digital Logbook stores personally identifiable information — email
address, full name, optional student number, degree and year of study — plus
user-authored content (projects, entries, tags). Under POPIA we act as the
**responsible party** for this data. That creates obligations including:

- **Purpose specification** — data must be collected for a defined, lawful
  purpose. Ours is the operation of the logbook the user signed up for.
- **Minimality** — only data necessary for the purpose. Every profile field
  is optional; an account is usable with just an email and password.
- **Security safeguards** — "appropriate, reasonable technical and
  organisational measures" to prevent loss, damage or unauthorised access.
- **Data subject participation** — users must be able to access and correct
  their data, and to have it deleted.
- **Breach notification** — if a breach occurs, the Information Regulator
  and affected data subjects must be notified.
- **Cross-border transfer** — data must not leave South Africa without an
  adequate level of protection.

**Specific exposures in this project:**

- The database is hosted on Neon in the **United States** (`us-east-2`).
  This is a cross-border transfer of personal information. In a production
  deployment we would need to document the legal basis, or use a region
  within South Africa.
- Emails are delivered through **Gmail's SMTP** service. Recipient addresses
  and email contents traverse Google's infrastructure.

### 3.2 Consumer Protection Act

The **right to cancel** and the **right to fair value, good quality and
safety** create a practical obligation: a user must be able to remove their
data on request. Our account deletion flow (§4.6) satisfies this.

### 3.3 Electronic Communications and Transactions Act (ECTA)

ECTA governs electronic signatures and records. Our session tokens are not
signatures, but the acceptance of the user's password at account creation
and every subsequent login constitutes an electronic transaction. We keep
auditable records through Prisma's `created_at` and `updated_at` columns.

### 3.4 Common-law duty of care

Independent of statute, a service that accepts and stores credentials owes
its users a duty of reasonable care. Negligently weak password storage,
absent encryption of 2FA secrets, or a hardcoded JWT secret would breach
this duty and expose the project to a civil claim after a breach.

### 3.5 Academic-integrity exposure

The brief requires "established libraries, not your own authentication
system." A submission that either rolled its own cryptography or delegated
everything to a provider would be non-compliant even if functionally
correct. §5 addresses how this project sits within that boundary.

---

## 4. Precautions in the implementation

Every precaution below refers to a specific line of code, not a general
principle.

### 4.1 Password storage

From `utils/auth.ts`:

```ts
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- **`bcryptjs` with cost factor 10.** The work factor is exponential: each
  increment doubles the time to test a guess. A cost of 10 takes
  approximately 100 ms per hash on current server hardware, which makes
  offline brute-force against the database expensive without noticeably
  slowing sign-in.
- **Per-password salt.** `bcrypt.genSalt` produces a fresh random salt for
  every account. Two users with the same password produce different hashes,
  and precomputed rainbow tables do not apply.
- **The plain password is never stored.** `hashPassword` is called inside
  `/register` and `/reset-password`; the return value is what reaches the
  database. Nothing else in the code path logs, serialises or transmits the
  raw password.
- **Constant-time comparison.** `bcrypt.compare` reads the salt embedded in
  the stored hash, re-hashes the incoming password with it, and compares the
  two digests. It is the library's constant-time implementation, not a
  string comparison in our code.

### 4.2 Session tokens

From `utils/auth.ts`:

```ts
const configuredSecret = process.env.JWT_SECRET;

if (!configuredSecret && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET is not set. Refusing to start in production...");
}

const JWT_SECRET = configuredSecret ?? randomBytes(48).toString("hex");

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}
```

- **Secret is environment-supplied.** `JWT_SECRET` comes from the process
  environment, never from a value written into the repository. The pre-fix
  fallback `"your-fallback-secret-key"` was removed in the course of the
  project; the current code refuses to start in production without a secret.
- **Startup refusal.** A misconfigured production deployment fails loudly on
  boot rather than silently signing sessions with a key the world can read.
- **Random fallback outside production.** Development environments generate
  a fresh 48-byte secret at process start. Sessions do not survive a
  restart, but no predictable key is ever used.
- **Seven-day expiry.** Every session token carries an `exp` claim. A stolen
  token has a bounded useful life.
- **Purpose-scoped claims.** OAuth state tokens and 2FA-pending tokens are
  signed with the same key but carry a `purpose` claim, and `verifyToken`
  rejects any token whose purpose is not the default. An OAuth state token
  cannot be replayed as a session even though it validates cryptographically:

```ts
if (payload.purpose !== undefined || typeof payload.userId !== "string") return null;
```

### 4.3 Middleware boundary

From `middleware/auth.middleware.ts`:

```ts
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized access: Token missing" });
  }
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Unauthorized access: Invalid or expired token" });
  }
  req.userId = decoded.userId;
  next();
}
```

- **Single point of enforcement.** Every protected route passes through this
  middleware. There is one implementation of "is this session valid," not one
  per route.
- **`req.userId` is derived from the verified token**, never from the request
  body or query. A caller cannot claim to be another user.
- **No session table.** JWTs are stateless. This is fast, but means
  individual token revocation is not possible before expiry. §5.2 discusses
  the trade-off.

### 4.4 Two-factor authentication

Two-factor authentication is opt-in and TOTP-based, compatible with Google
Authenticator, Authy and any RFC 6238 client.

**Secret encryption.** The TOTP secret is encrypted before storage (see
`utils/twoFactorSecret.ts`, invoked from `auth.routes.ts`). A database
reader who finds the column cannot derive valid TOTP codes. The `/2fa/setup`
endpoint refuses to proceed if the encryption key is not present:

```ts
if (!hasEncryptionKey()) {
  return res.status(503).json({
    error: "Two-factor authentication is unavailable: the server is missing its encryption key...",
  });
}
```

This is a deliberate design decision: failing closed rather than storing an
unprotected secret.

**Second-step binding (BUG-006).** `/login` does not issue a session when
2FA is enabled. It issues a short-lived token whose purpose is `2fa-pending`:

```ts
return res.json({
  requiresTwoFactor: true,
  email: user.email,
  twoFactorToken: generateTwoFactorPendingToken(user.id),
});
```

`/login/2fa` accepts only that token as proof the password step happened:

```ts
const userId = verifyTwoFactorPendingToken(twoFactorToken);
if (!userId) {
  return res.status(401).json({ error: "Your sign-in session has expired..." });
}
```

The pending token expires in five minutes — long enough to read a code off a
phone, short enough to be useless if intercepted and held.

**Recovery codes (BUG-005).** When 2FA is enabled the user receives ten
single-use recovery codes. Only SHA-256 digests are stored; the raw codes
exist only in the enable response and cannot be retrieved later. Codes are
consumed through an atomic update:

```ts
const { count } = await prisma.twoFactorRecoveryCode.updateMany({
  where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
  data: { usedAt: new Date() },
});
return count === 1;
```

The `usedAt: null` guard lives inside the `UPDATE`. Two concurrent requests
with the same code cannot both succeed: the database applies the predicate
atomically and only one caller sees a row count of 1.

### 4.5 Email token handling

From `auth.routes.ts`:

```ts
const verificationToken = generateRawToken();
const verificationExpiry = new Date(Date.now() + 3600000);

const user = await prisma.user.create({
  data: {
    ...
    emailVerificationToken: hashToken(verificationToken),
    emailVerificationExpiry: verificationExpiry,
  },
});
```

- **The stored value is a digest, not the raw token.** A database read cannot
  be turned into a verification of the attacker's own email.
- **One-hour expiry.** Both the verification token and the reset token are
  valid for one hour.
- **Single use.** Both are nulled or deleted upon consumption. The reset flow
  also deletes every other reset row for that user in a single transaction,
  so a leaked token from an earlier request cannot be used after a later
  reset has completed.

Reset tokens are deleted transactionally:

```ts
await prisma.$transaction([
  prisma.user.update({ where: { id: resetRecord.userId }, data: { passwordHash: newPasswordHash } }),
  prisma.passwordReset.deleteMany({ where: { userId: resetRecord.userId } }),
]);
```

Either both operations commit or neither does. A half-completed reset
cannot leave a consumed token behind.

### 4.6 Account deletion (30-day grace period)

The `DELETE /account` handler does not remove the user immediately. It sets
`scheduled_deletion_at` to midnight thirty days out:

```ts
const scheduledDeletionAt = user.scheduledDeletionAt ?? (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setHours(0, 0, 0, 0);
  return d;
})();
```

- **Re-confirmed with the password.** Holding a valid session is not
  sufficient to start a deletion. A stolen token cannot trigger it.
- **Email notice.** `sendDeletionScheduledEmail` informs the user with the
  exact date so the decision is visible and reversible.
- **Cancel endpoint.** `POST /account/cancel-deletion` clears the timestamp.
  A user who changes their mind signs back in and the deletion is cancelled
  by a distinct, explicit action.
- **Cascade.** The `User` model carries `onDelete: Cascade` on its relations,
  so when the purge runs, projects, entries, tags and 2FA codes are removed
  together.
- **Purge job.** A scheduled task sweeps expired deletions hourly and on
  startup. Login also checks the timestamp, so a user whose grace period has
  already expired cannot sign in while the sweep is pending.

### 4.7 Rate limiting

From `rateLimit.middleware.ts`:

| Limiter | Window | Limit | Applies to |
| --- | --- | --- | --- |
| `loginLimiter` | 15 min | 20 | `/login` |
| `twoFactorLimiter` | 15 min | 10 | `/login/2fa` |
| `registerLimiter` | 60 min | 5 | `/register` |
| `authLimiter` | 15 min | 100 | All auth routes (headers) |
| `assistantLimiter` | 10 min | 30 | Help assistant |

- **Password guessing is bounded.** Twenty attempts per IP per 15 minutes
  means a brute force attack against an 8-character password is infeasible.
- **TOTP brute force is bounded more tightly.** A six-digit code is one
  million possibilities; ten attempts per 15 minutes means an attacker
  exhausts less than 0.001% of the space per day.
- **Registration spam is bounded.** Five accounts per IP per hour.

Rate limiting can be disabled in tests through `RATE_LIMIT_DISABLED`,
and by default is off under `NODE_ENV=test`. This keeps the auth suite
fast without weakening production.

### 4.8 Email enumeration resistance

The `/forgot-password` handler responds identically whether or not the email
exists:

```ts
if (!user) {
  return res.json({ message: "If account exists, a password reset email has been sent." });
}
```

`/login` returns "Invalid email or password" for both a missing account and a
wrong password. An attacker cannot distinguish the two cases through the API
and use that distinction to enumerate valid accounts.

### 4.9 HTTPS and transport

In production, the frontend is served over HTTPS by Cloudflare Pages and the
API by Render's TLS-terminating proxy. Passwords, tokens and email links
traverse the network encrypted. Local development runs over plain HTTP on
localhost, which is acceptable because the loopback interface is not
reachable by other hosts.

### 4.10 Secret management

Every secret lives in an environment variable that is never committed:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs session tokens |
| `TWO_FACTOR_ENCRYPTION_KEY` | Encrypts TOTP secrets at rest |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Sends verification, reset and deletion emails |
| `DATABASE_URL` | Prisma connection string |
| `APP_URL` | Base URL for links in emails |

`.env` is listed in `.gitignore`. In production the same variables are set in
the Render dashboard.

---

## 5. Pros and cons of the self-hosted approach

### 5.1 Advantages

- **Full control of data.** Email addresses, hashes and TOTP secrets stay in
  our PostgreSQL instance. We decide retention, region and deletion timing. A
  provider would store equivalent data on our behalf and under their terms.
- **Full control of flow.** Account deletion with a 30-day grace period is
  uncommon; most providers offer "delete now." Our design gives users a
  reversible window and sends an email at the moment of scheduling. That is a
  product decision we would not have been able to make with Auth0.
- **No vendor lock-in.** If Neon, Render or Cloudflare went offline tomorrow,
  the code would run anywhere Node and PostgreSQL run. A JWT session issued on
  one deployment is valid on another, provided the secret matches.
- **Cost.** `bcryptjs`, `jsonwebtoken`, `otplib` and `nodemailer` are free. At
  scale they would still be free; per-user pricing does not apply.
- **Alignment with the brief.** The brief says "You must design and implement
  your API" and "you may not write your own authentication system." Our
  implementation does the first and demonstrably avoids the second by using
  libraries for every primitive.
- **Direct experience.** Every trade-off in this document reflects a decision
  the team made and can defend. A provider solution would have hidden the
  same decisions behind a UI.

### 5.2 Disadvantages

- **We own the failures.** The audit trail of this project includes several
  bug reports whose fixes appear in this document — BUG-002 (hardcoded JWT
  secret), BUG-004 (unencrypted TOTP secrets), BUG-005 (no recovery codes),
  BUG-006 (2FA step not bound to the password step). Each was a real weakness
  until it was closed. A provider would have prevented those specific bugs at
  the cost of removing our ability to fix others.
- **No session revocation list.** JWTs are valid until they expire. If a user
  reports a stolen laptop, we cannot revoke a specific token — the attacker
  keeps access for up to seven days. A session table would allow per-device
  logout, at the cost of a database lookup on every request. Auth0 provides
  this as a feature.
- **No device management.** Users cannot see "you are signed in on 4 devices"
  and remove one. That is out of scope for this project.
- **No WebAuthn or SSO.** Users cannot sign in with Google, GitHub or a
  hardware key. Adding Google OAuth would reduce password reliance, but it
  would also mean Google becomes an identity provider for our accounts,
  blurring the boundary the brief draws.
- **No breach-list check.** We do not consult Have I Been Pwned or an
  equivalent to reject known-compromised passwords at signup. A library like
  `zxcvbn` or a HIBP API call would close this gap.
- **No password rotation or expiry.** Users can keep the same password
  indefinitely. NIST guidance currently discourages forced rotation, so this
  is not considered a weakness, but it is a departure from what some auditors
  expect.
- **Limited audit trail.** We do not log successful logins, failed logins, 2FA
  challenges or password resets in a way that would answer "was this account
  accessed on 3 October?" That would be a large addition and out of scope.
- **Operational fragility.** Every deployment must set six environment
  variables correctly. A missing `JWT_SECRET` in production means no one can
  sign in. A missing `GMAIL_APP_PASSWORD` means no one receives verification
  emails. A provider would handle these centrally.

### 5.3 Comparison table

| Concern | Digital Logbook (self-hosted) | Auth0 / Google Sign-In |
| --- | --- | --- |
| Password hashing | `bcryptjs`, our DB | Vendor's |
| Session tokens | JWT, our keys | Vendor's |
| 2FA | `otplib`, our secrets | Vendor's |
| Recovery codes | Our implementation | Vendor's |
| Account recovery | Email link we send | Vendor sends |
| Session revocation | Not possible | Supported |
| Breach-list check | Not implemented | Often provided |
| WebAuthn | Not implemented | Supported |
| Audit logs | Not implemented | Provided |
| SSO convenience | None | One-click |
| Data controller for POPIA | Us | Joint with vendor |
| Cross-border transfer | Neon `us-east-2` | Vendor's regions |
| Vendor lock-in | None | Significant |
| Cost at scale | Free | Per-user |
| Brief compliance | Full | Ambiguous — vendor owns auth |

---

## 6. Residual risk and future work

Even after every precaution in §4, the following residual risks remain:

- **Region.** Neon is hosted in the United States. For POPIA compliance in
  a real deployment we would either move to a South African region or
  document the legal basis for the transfer.
- **No compromise detection.** We do not alert on failed login spikes or
  password reset bursts.
- **No account lockout.** Repeated failed logins are rate-limited but the
  account itself is never locked. This is deliberate — lockout is a
  denial-of-service vector — but it is a design choice.
- **Secret rotation.** `JWT_SECRET` can be rotated, but doing so invalidates
  every active session. There is no rolling rotation scheme.
- **TOTP window.** `otplib`'s default acceptance window of one step means a
  code is valid for approximately 90 seconds. A stricter window would
  reduce the interceptability but increase failed attempts.

Future work in a production system would address each of these; none is
required by the project brief.

---

## 7. Conclusion

The Digital Logbook implements authentication using established libraries
called from endpoints the team wrote. No cryptographic primitive is
implemented by us: `bcryptjs` does password hashing, `jsonwebtoken` does session
tokens, `otplib` does TOTP, and `nodemailer` delivers email through Gmail SMTP.
The current implementation reflects a running list of bug fixes that closed
specific weaknesses — a hardcoded JWT secret, unencrypted TOTP secrets,
unbound 2FA steps, and absent recovery codes — each of which is documented
in the project's issue tracker.

The legal liabilities are those of any service that stores credentials and
PII: POPIA obligations, a duty of reasonable care, and the practical
requirement that users can delete their accounts. The precautions in §4
address each of these with a specific, code-level mitigation. The remaining
disadvantages — no session revocation, no SSO, no audit log — are the price
of running the system ourselves, and each has a well-understood fix that a
production deployment would apply.

The brief's requirement that we use libraries rather than build our own
authentication is satisfied. The brief's requirement that we design and
implement our own API is satisfied. This document records both.