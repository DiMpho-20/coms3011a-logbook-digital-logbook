import { z } from "zod";

// ==========================================
// 1. US00.1 - Registration Schema & DTO
// ==========================================
export const registerSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name is too long"),
  email: z
    .string()
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export type RegisterDto = z.infer<typeof registerSchema>;

// ==========================================
// 2. US00.2 - Sign-In Schema & DTO
// ==========================================
export const loginSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginDto = z.infer<typeof loginSchema>;

// ==========================================
// 3. US00.3 - Password Reset Schemas & DTOs
// ==========================================
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email address"),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z
    .string()
    .min(1, "Reset token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

// ==========================================
// 4. US00.4 - Account Deletion Schema & DTO
// ==========================================
export const deleteAccountSchema = z.object({
  confirmPassword: z
    .string()
    .min(1, "Password confirmation is required to delete account"),
});

export type DeleteAccountDto = z.infer<typeof deleteAccountSchema>;

// ==========================================
// 5. Email Verification Schema & DTO
// ==========================================
export const verifyEmailSchema = z.object({
  token: z
    .string()
    .min(1, "Verification token is required"),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

// ==========================================
// 6. Two-Factor Authentication (2FA) Schemas
// ==========================================
export const verifyTwoFactorSetupSchema = z.object({
  token: z
    .string()
    .length(6, "Authentication code must be exactly 6 digits")
    .regex(/^\d+$/, "Code must contain only numbers"),
});

export type VerifyTwoFactorSetupDto = z.infer<typeof verifyTwoFactorSetupSchema>;

// A six-digit TOTP code, or a recovery code as "XXXXX-XXXXX". Both arrive in
// the same field because the user is answering one question — "prove it is
// you" — and should not have to tell us which kind of answer they are giving.
const TOTP_CODE = /^\d{6}$/;
const RECOVERY_CODE = /^[A-Za-z0-9]{5}[-\s]?[A-Za-z0-9]{5}$/;

export const twoFactorLoginSchema = z.object({
  // Proof that the password step of this same sign-in succeeded (BUG-006).
  // Not the session token, and not interchangeable with one.
  twoFactorToken: z
    .string()
    .min(1, "Your sign-in session has expired. Please sign in again."),
  code: z
    .string()
    .trim()
    .refine(
      (value) => TOTP_CODE.test(value) || RECOVERY_CODE.test(value),
      "Enter the 6-digit code from your authenticator app, or one of your recovery codes"
    ),
});

export type TwoFactorLoginDto = z.infer<typeof twoFactorLoginSchema>;

export const disableTwoFactorSchema = z.object({
  password: z.string().min(1, "Password confirmation is required"),
});

export type DisableTwoFactorDto = z.infer<typeof disableTwoFactorSchema>;

// Regenerating recovery codes invalidates every existing one, so it is gated
// on the password the same way disabling 2FA is.
export const regenerateRecoveryCodesSchema = z.object({
  password: z.string().min(1, "Password confirmation is required"),
});

export type RegenerateRecoveryCodesDto = z.infer<typeof regenerateRecoveryCodesSchema>;