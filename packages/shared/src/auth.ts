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