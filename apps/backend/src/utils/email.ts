import nodemailer from "nodemailer";
import { Resend } from "resend";

const APP_URL = process.env.APP_URL || "http://localhost:5173";

// ── Email provider resolution ────────────────────────────────────────────
// Priority: Resend API  ▸  Gmail SMTP  ▸  dev-mode console log
// The app never breaks — it always picks the best available provider.

type EmailProvider = "resend" | "gmail" | "dev";

function resolveProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return "gmail";
  return "dev";
}

const provider: EmailProvider = resolveProvider();

// Gmail transporter (only created when credentials are present)
const transporter =
  provider === "gmail"
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })
    : null;

// Resend client (only created when API key is present)
const resend =
  provider === "resend"
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

const RESEND_FROM = process.env.RESEND_FROM || "Digital Logbook <onboarding@resend.dev>";

// ── Internal send helper ─────────────────────────────────────────────────

async function send(toEmail: string, subject: string, html: string): Promise<void> {
  if (provider === "resend" && resend) {
    const { error } = await resend.emails.send({
      from: RESEND_FROM,
      to: toEmail,
      subject,
      html,
    });
    if (error) throw new Error(`Resend API error: ${error.message}`);
    return;
  }

  if (provider === "gmail" && transporter) {
    await transporter.sendMail({
      from: `"Digital Logbook" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject,
      html,
    });
    return;
  }

  // Dev mode — log to console so developers can copy the link
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  📧 EMAIL (dev mode — no provider configured)`);
  console.log(`  To: ${toEmail}`);
  console.log(`  Subject: ${subject}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

// ── Public API ───────────────────────────────────────────────────────────

export async function sendVerificationEmail(toEmail: string, token: string) {
  const verifyLink = `${APP_URL}/verify-email?token=${token}`;

  try {
    await send(
      toEmail,
      "Verify Your Email Address - Digital Logbook",
      `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 30px; color: #ffffff; border-radius: 10px;">
          <h2 style="color: #00c6ff;">Welcome to Digital Logbook!</h2>
          <p style="color: #cbd5e1; font-size: 16px;">
            Thank you for registering. Please confirm your email address to activate your account.
          </p>
          <div style="margin: 30px 0;">
            <a href="${verifyLink}" 
               style="background: linear-gradient(135deg, #0072ff 0%, #7000ff 100%); 
                      color: #ffffff; 
                      padding: 12px 24px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: bold; 
                      display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 14px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #00c6ff; font-size: 13px; word-break: break-all;">
            ${verifyLink}
          </p>
        </div>
      `,
    );
    console.log(`Verification email sent to ${toEmail} via ${provider}`);
  } catch (error) {
    console.error("Failed to send verification email:", error);
  }
}

export async function sendPasswordResetEmail(toEmail: string, token: string) {
  const resetLink = `${APP_URL}/reset-password?token=${token}`;

  try {
    await send(
      toEmail,
      "Reset Your Password - Digital Logbook",
      `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; padding: 30px; color: #ffffff; border-radius: 10px;">
          <h2 style="color: #00c6ff;">Reset Password Request</h2>
          <p style="color: #cbd5e1; font-size: 16px;">
            We received a request to reset your password. Click the button below to choose a new password:
          </p>
          <div style="margin: 30px 0;">
            <a href="${resetLink}" 
               style="background: linear-gradient(135deg, #0072ff 0%, #7000ff 100%); 
                      color: #ffffff; 
                      padding: 12px 24px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: bold; 
                      display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 14px;">
            This link will expire in 1 hour. If you didn't request this, you can ignore this email.
          </p>
        </div>
      `,
    );
    console.log(`Password reset email sent to ${toEmail} via ${provider}`);
  } catch (error) {
    console.error("Failed to send password reset email:", error);
  }
}
