import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { 
  registerSchema, 
  loginSchema, 
  verifyEmailSchema,
  forgotPasswordSchema, 
  resetPasswordSchema, 
  deleteAccountSchema 
} from "shared";
import { hashPassword, comparePassword, generateToken } from "../utils/auth.js";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/email.js";

const router = Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------
// US00.1: POST /api/auth/register
// ---------------------------------------------------------
router.post("/register", async (req: Request, res: Response) => {
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

  // Send real verification email using positional arguments
  try {
    await sendVerificationEmail(user.email, verificationToken);
  } catch (emailErr) {
    console.error("Failed to send verification email:", emailErr);
  }

  return res.status(201).json({
    message: "User registered successfully. Please check your email to verify your account.",
    user: { id: user.id, fullName: user.fullName, email: user.email },
  });
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
router.post("/login", async (req: Request, res: Response) => {
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

  const token = generateToken(user.id);
  return res.json({
    message: "Login successful",
    user: { id: user.id, fullName: user.fullName, email: user.email },
    token,
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

export default router;