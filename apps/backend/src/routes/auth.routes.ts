import { Router, Request, Response } from "express";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { 
  registerSchema, 
  loginSchema, 
  verifyEmailSchema,
  forgotPasswordSchema, 
  resetPasswordSchema, 
  deleteAccountSchema,
  verifyTwoFactorSetupSchema,
  twoFactorLoginSchema,
  disableTwoFactorSchema,
  regenerateRecoveryCodesSchema,
} from "@logbook/shared";
import {
  hashPassword,
  comparePassword,
  generateToken,
  generateTwoFactorPendingToken,
  verifyTwoFactorPendingToken,
} from "../utils/auth.js";
import {
  encryptTwoFactorSecret,
  decryptTwoFactorSecret,
  isEncryptedSecret,
  hasEncryptionKey,
} from "../utils/twoFactorSecret.js";
import {
  generateRawToken,
  hashToken,
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "../utils/tokens.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { loginLimiter, twoFactorLimiter, registerLimiter } from "../middleware/rateLimit.middleware.js";
import { sendVerificationEmail, sendPasswordResetEmail, sendDeletionScheduledEmail } from "../utils/email.js";
import prisma from "../prisma.js";

const router = Router();

/**
 * Spend a recovery code, atomically.
 *
 * The usedAt: null guard is inside the UPDATE rather than a read followed by
 * a write, so two requests racing with the same code cannot both succeed —
 * exactly one of them sees a row count of 1.
 */
async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const { count } = await prisma.twoFactorRecoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}

/** How many unspent codes the user has left. */
function countUnusedRecoveryCodes(userId: string): Promise<number> {
  return prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } });
}

/** Replace the whole set. Returns the raw codes — the only time they exist outside the user's hands. */
async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
  ]);
  return codes;
}

// ---------------------------------------------------------
// US00.1: POST /api/auth/register
// ---------------------------------------------------------
router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
    }

    const { fullName, email, password } = parseResult.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);

    // Generate Email Verification Token (1 hour validity).
    // The raw token goes in the email; only its digest is stored, so a read
    // of the users table cannot be used to verify someone else's address.
    const verificationToken = generateRawToken();
    const verificationExpiry = new Date(Date.now() + 3600000); // 1 hour

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        isEmailVerified: false,
        emailVerificationToken: hashToken(verificationToken),
        emailVerificationExpiry: verificationExpiry,
      },
    });

    // Check if any email provider is configured (Resend > Gmail SMTP)
    const hasEmailConfig =
      process.env.RESEND_API_KEY ||
      (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

    if (hasEmailConfig) {
      // Send verification email
      try {
        await sendVerificationEmail(user.email, verificationToken);
      } catch (emailErr) {
        console.error("Failed to send verification email:", emailErr);
      }
    } else {
      // Dev mode: auto-verify and log the link
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  📧 EMAIL VERIFICATION (no SMTP configured)`);
      console.log(`  Verify link: http://localhost:5173/verify-email?token=${verificationToken}`);
      console.log(`  Auto-verifying account for development...`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        },
      });
    }

    const message = hasEmailConfig
      ? "Account registered! Check your inbox for the verification link. If you don't see it within a minute, check your spam folder."
      : "User registered successfully. Email auto-verified (dev mode).";

    return res.status(201).json({
      message,
      user: { id: user.id, fullName: user.fullName, email: user.email },
    });
  } catch (err) {
    console.error("POST /auth/register failed:", err);
    return res.status(500).json({
      error: "Registration failed. The database may need to be migrated. Run `npx prisma migrate deploy` in the backend folder.",
    });
  }
});

// ---------------------------------------------------------
// NEW: POST /api/auth/verify-email
// ---------------------------------------------------------
router.post("/verify-email", async (req: Request, res: Response) => {
  const parseResult = verifyEmailSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const { token } = parseResult.data;

  const user = await prisma.user.findFirst({
    where: {
      emailVerificationToken: hashToken(token),
      emailVerificationExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    return res.status(400).json({ error: "Invalid or expired verification token" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    },
  });

  return res.json({ message: "Email verified successfully. You can now log in." });
});

// ---------------------------------------------------------
// US00.2: POST /api/auth/login
// ---------------------------------------------------------
router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const { email, password } = parseResult.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Scheduled for deletion?
  if (user.scheduledDeletionAt) {
    if (user.scheduledDeletionAt <= new Date()) {
      // Grace period expired — hard delete now and reject login
      await prisma.user.delete({ where: { id: user.id } });
      return res.status(401).json({ error: "Invalid email or password" });
    }
    // Grace period active — allow login, but surface the date below
  }

  // BLOCK LOGIN IF EMAIL NOT VERIFIED
  if (!user.isEmailVerified) {
    return res.status(403).json({ 
      error: "Please verify your email address before logging in." 
    });
  }

  // If 2FA is enabled, don't issue token yet — require TOTP code
  if (user.isTwoFactorEnabled) {
    // The password has verified. Hand back a short-lived, purpose-scoped
    // token that /login/2fa will demand — that token is what makes the second
    // step part of *this* sign-in rather than a standalone way in (BUG-006).
    return res.json({
      requiresTwoFactor: true,
      email: user.email,
      twoFactorToken: generateTwoFactorPendingToken(user.id),
    });
  }

  const token = generateToken(user.id);
  return res.json({
    message: "Login successful",
    user: { id: user.id, fullName: user.fullName, email: user.email },
    token,
    scheduledDeletionAt: user.scheduledDeletionAt?.toISOString() ?? null,
  });
});

// ---------------------------------------------------------
// POST /api/auth/login/2fa — Complete login with TOTP code
// ---------------------------------------------------------
router.post("/login/2fa", twoFactorLimiter, async (req: Request, res: Response) => {
  const parseResult = twoFactorLoginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const { twoFactorToken, code } = parseResult.data;

  // BUG-006: the account is identified by a token this server issued after
  // the password verified, not by an email address in the request body. The
  // old handler would complete a login for anyone who could produce a valid
  // code, which made the second factor a replacement for the password rather
  // than an addition to it.
  const userId = verifyTwoFactorPendingToken(twoFactorToken);
  if (!userId) {
    return res
      .status(401)
      .json({ error: "Your sign-in session has expired. Please sign in again." });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  let usedRecoveryCode = false;

  if (looksLikeRecoveryCode(code)) {
    usedRecoveryCode = await consumeRecoveryCode(user.id, code);
    if (!usedRecoveryCode) {
      return res.status(401).json({ error: "Invalid authentication code" });
    }
  } else {
    const secret = decryptTwoFactorSecret(user.twoFactorSecret);
    const isValid = verifySync({ token: code, secret });

    if (!isValid.valid) {
      return res.status(401).json({ error: "Invalid authentication code" });
    }

    // Opportunistic migration (BUG-004): a secret stored before encryption
    // landed is rewritten the first time its owner signs in, so the plaintext
    // rows drain away on their own instead of needing a backfill window. A
    // failure here must not fail the login — the user did nothing wrong.
    if (!isEncryptedSecret(user.twoFactorSecret) && hasEncryptionKey()) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorSecret: encryptTwoFactorSecret(secret) },
        });
      } catch (err) {
        console.error("Failed to re-encrypt two-factor secret:", err);
      }
    }
  }

  const jwtToken = generateToken(user.id);
  return res.json({
    message: "Login successful",
    user: { id: user.id, fullName: user.fullName, email: user.email },
    token: jwtToken,
    scheduledDeletionAt: user.scheduledDeletionAt?.toISOString() ?? null,
    usedRecoveryCode,
    recoveryCodesRemaining: await countUnusedRecoveryCodes(user.id),
  });
});

// ---------------------------------------------------------
// US00.3: POST /api/auth/forgot-password
// ---------------------------------------------------------
router.post("/forgot-password", async (req: Request, res: Response) => {
  const parseResult = forgotPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const { email } = parseResult.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Return success even if user not found to prevent email enumeration attacks
  if (!user) {
    return res.json({ message: "If an account exists with that email, a reset link has been sent. Check your inbox — if you don't see it within a minute, check your spam folder." });
  }

  // Generate secure random reset token. The raw value is emailed and never
  // stored; the column holds its SHA-256 digest, so read access to
  // password_resets no longer lets anyone complete a reset in flight.
  const resetToken = generateRawToken();
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour expiration

  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: hashToken(resetToken), expiresAt },
  });

  // Send password reset email using positional arguments
  try {
    await sendPasswordResetEmail(user.email, resetToken);
  } catch (emailErr) {
    console.error("Failed to send password reset email:", emailErr);
  }

  return res.json({
    message: "If an account exists with that email, a reset link has been sent. Check your inbox — if you don't see it within a minute, check your spam folder.",
  });
});

// ---------------------------------------------------------
// US00.3: POST /api/auth/reset-password
// ---------------------------------------------------------
router.post("/reset-password", async (req: Request, res: Response) => {
  const parseResult = resetPasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const { token, newPassword } = parseResult.data;

  const resetRecord = await prisma.passwordReset.findFirst({
    where: {
      tokenHash: hashToken(token),
      expiresAt: { gt: new Date() },
    },
  });

  if (!resetRecord) {
    return res.status(400).json({ error: "Invalid or expired password reset token" });
  }

  const newPasswordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordReset.deleteMany({
      where: { userId: resetRecord.userId },
    }),
  ]);

  return res.json({ message: "Password updated successfully. You can now log in." });
});

// ---------------------------------------------------------
// US00.4: DELETE /api/auth/account — schedule deletion (30-day grace)
// ---------------------------------------------------------
router.delete("/account", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const parseResult = deleteAccountSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const userId = req.userId!;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.passwordHash) {
    return res.status(404).json({ error: "User not found" });
  }

  const isPasswordValid = await comparePassword(parseResult.data.confirmPassword, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Incorrect password. Cannot delete account." });
  }

  // If already scheduled, keep the existing date. Otherwise set it to midnight, 30 days out.
  const scheduledDeletionAt =
    user.scheduledDeletionAt ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

  if (!user.scheduledDeletionAt) {
    await prisma.user.update({
      where: { id: userId },
      data: { scheduledDeletionAt },
    });
    await sendDeletionScheduledEmail(user.email, scheduledDeletionAt);
  }

  return res.json({
    message: `Your account will be permanently deleted on ${scheduledDeletionAt.toDateString()}.`,
    scheduledDeletionAt: scheduledDeletionAt.toISOString(),
  });
});

// ---------------------------------------------------------
// US00.4b: POST /api/auth/account/cancel-deletion
// ---------------------------------------------------------
router.post("/account/cancel-deletion", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!user.scheduledDeletionAt) {
    return res.status(400).json({ error: "No deletion is currently scheduled" });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { scheduledDeletionAt: null },
  });

  return res.json({ message: "Account deletion cancelled." });
});

// ---------------------------------------------------------
// 2FA: POST /api/auth/2fa/setup — Generate secret & QR code
// ---------------------------------------------------------
router.post("/2fa/setup", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.isTwoFactorEnabled) {
    return res.status(400).json({ error: "Two-factor authentication is already enabled" });
  }

  // Refuse to start rather than write a secret we cannot protect (BUG-004).
  // A 503 with the cause named beats a 500 from deep inside the crypto call.
  if (!hasEncryptionKey()) {
    return res.status(503).json({
      error:
        "Two-factor authentication is unavailable: the server is missing its " +
        "encryption key. Set TWO_FACTOR_ENCRYPTION_KEY and restart.",
    });
  }

  // Generate a new TOTP secret
  const secret = generateSecret();
  const otpauthUrl = generateURI({ secret, issuer: "Digital Logbook", label: user.email });

  // Generate QR code as data URL
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

  // Store the secret temporarily (not yet enabled until verified)
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encryptTwoFactorSecret(secret), isTwoFactorEnabled: false },
  });

  return res.json({ secret, qrCodeUrl });
});

// ---------------------------------------------------------
// 2FA: POST /api/auth/2fa/verify-setup — Verify code & enable 2FA
// ---------------------------------------------------------
router.post("/2fa/verify-setup", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const parseResult = verifyTwoFactorSetupSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const userId = req.userId!;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.twoFactorSecret) {
    return res.status(400).json({ error: "No 2FA setup in progress. Call /2fa/setup first." });
  }

  if (user.isTwoFactorEnabled) {
    return res.status(400).json({ error: "Two-factor authentication is already enabled" });
  }

  const isValid = verifySync({
    token: parseResult.data.token,
    secret: decryptTwoFactorSecret(user.twoFactorSecret),
  });

  if (!isValid.valid) {
    return res.status(400).json({ error: "Invalid code. Please try again." });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isTwoFactorEnabled: true },
  });

  // BUG-005: without these, losing the authenticator device means losing the
  // account. This response is the only time the codes exist in readable form
  // — the database holds digests — so the client must show them now.
  const recoveryCodes = await issueRecoveryCodes(userId);

  return res.json({
    message: "Two-factor authentication enabled successfully",
    recoveryCodes,
  });
});

// ---------------------------------------------------------
// 2FA: POST /api/auth/2fa/disable — Disable 2FA with password
// ---------------------------------------------------------
router.post("/2fa/disable", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const parseResult = disableTwoFactorSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
  }

  const userId = req.userId!;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!user.isTwoFactorEnabled) {
    return res.status(400).json({ error: "Two-factor authentication is not enabled" });
  }

  const isPasswordValid = await comparePassword(parseResult.data.password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  // The codes are only meaningful alongside a secret; leaving them behind
  // would let a stale one unlock a later, unrelated 2FA setup.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
      },
    }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
  ]);

  return res.json({ message: "Two-factor authentication disabled" });
});

// ---------------------------------------------------------
// 2FA: GET /api/auth/2fa/status — Check if 2FA is enabled
// ---------------------------------------------------------
router.get("/2fa/status", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isTwoFactorEnabled: true },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({
    isTwoFactorEnabled: user.isTwoFactorEnabled,
    recoveryCodesRemaining: user.isTwoFactorEnabled
      ? await countUnusedRecoveryCodes(userId)
      : 0,
    recoveryCodeCount: RECOVERY_CODE_COUNT,
  });
});

// ---------------------------------------------------------
// 2FA: POST /api/auth/2fa/recovery-codes — regenerate the set
// ---------------------------------------------------------
router.post(
  "/2fa/recovery-codes",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const parseResult = regenerateRecoveryCodesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ errors: parseResult.error.flatten().fieldErrors });
    }

    const userId = req.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.isTwoFactorEnabled) {
      return res.status(400).json({ error: "Two-factor authentication is not enabled" });
    }

    // Regenerating invalidates every existing code, so it is gated on the
    // password exactly as disabling 2FA is — otherwise a borrowed session
    // could quietly mint itself a permanent way back in.
    const isPasswordValid = await comparePassword(parseResult.data.password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const recoveryCodes = await issueRecoveryCodes(userId);

    return res.json({
      message: "New recovery codes generated. Your previous codes no longer work.",
      recoveryCodes,
    });
  }
);

export default router;