import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { generateSecret, generateURI, verifySync, generateSync } from "otplib";
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
} from "@logbook/shared";
import { hashPassword, comparePassword, generateToken } from "../utils/auth.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { loginLimiter, twoFactorLimiter, registerLimiter } from "../middleware/rateLimit.middleware.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/email.js";
import prisma from "../prisma.js";

const router = Router();

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

    // Generate Email Verification Token (1 hour validity)
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpiry = new Date(Date.now() + 3600000); // 1 hour

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        isEmailVerified: false,
        emailVerificationToken: verificationToken,
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
      ? "User registered successfully. Please check your email to verify your account."
      : "User registered successfully. Email auto-verified (dev mode).";

    return res.status(201).json({
      message,
      user: { id: user.id, fullName: user.fullName, email: user.email },
    });
  } catch (err) {
    console.error("POST /auth/register failed:", err);
    return res.status(500).json({
      error: "Registration failed. The database may need to be migrated. Run `npx prisma db push` in the backend folder.",
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
      emailVerificationToken: token,
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

  // BLOCK LOGIN IF EMAIL NOT VERIFIED
  if (!user.isEmailVerified) {
    return res.status(403).json({ 
      error: "Please verify your email address before logging in." 
    });
  }

  // If 2FA is enabled, don't issue token yet — require TOTP code
  if (user.isTwoFactorEnabled) {
    return res.json({
      requiresTwoFactor: true,
      email: user.email,
    });
  }

  const token = generateToken(user.id);
  return res.json({
    message: "Login successful",
    user: { id: user.id, fullName: user.fullName, email: user.email },
    token,
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

  const { email, token: totpCode } = parseResult.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.twoFactorSecret) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const isValid = verifySync({
    token: totpCode,
    secret: user.twoFactorSecret,
  });

  if (!isValid.valid) {
    return res.status(401).json({ error: "Invalid authentication code" });
  }

  const jwtToken = generateToken(user.id);
  return res.json({
    message: "Login successful",
    user: { id: user.id, fullName: user.fullName, email: user.email },
    token: jwtToken,
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
    return res.json({ message: "If account exists, a password reset email has been sent." });
  }

  // Generate secure random reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour expiration

  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: resetToken, expiresAt },
  });

  // Send password reset email using positional arguments
  try {
    await sendPasswordResetEmail(user.email, resetToken);
  } catch (emailErr) {
    console.error("Failed to send password reset email:", emailErr);
  }

  return res.json({
    message: "If account exists, a password reset email has been sent.",
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
      tokenHash: token, 
      expiresAt: { gt: new Date() } 
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
// US00.4: DELETE /api/auth/account
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

  await prisma.user.delete({ where: { id: userId } });

  return res.json({ message: "Account deleted successfully." });
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

  // Generate a new TOTP secret
  const secret = generateSecret();
  const otpauthUrl = generateURI({ secret, issuer: "Digital Logbook", label: user.email });

  // Generate QR code as data URL
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

  // Store the secret temporarily (not yet enabled until verified)
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: secret, isTwoFactorEnabled: false },
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
    secret: user.twoFactorSecret,
  });

  if (!isValid.valid) {
    return res.status(400).json({ error: "Invalid code. Please try again." });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isTwoFactorEnabled: true },
  });

  return res.json({ message: "Two-factor authentication enabled successfully" });
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

  await prisma.user.update({
    where: { id: userId },
    data: {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
    },
  });

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

  return res.json({ isTwoFactorEnabled: user.isTwoFactorEnabled });
});

export default router;