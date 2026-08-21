import nodemailer from "nodemailer";

// Configure Nodemailer with Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const APP_URL = process.env.APP_URL || "http://localhost:5173";

export async function sendVerificationEmail(toEmail: string, token: string) {
  const verifyLink = `${APP_URL}/verify-email?token=${token}`;

  try {
    await transporter.sendMail({
      from: `"Digital Logbook" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: "Verify Your Email Address - Digital Logbook",
      html: `
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
    });
    console.log(`Verification email successfully sent to ${toEmail}`);
  } catch (error) {
    console.error("Failed to send verification email:", error);
  }
}

export async function sendPasswordResetEmail(toEmail: string, token: string) {
  const resetLink = `${APP_URL}/reset-password?token=${token}`;

  try {
    await transporter.sendMail({
      from: `"Digital Logbook" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: "Reset Your Password - Digital Logbook",
      html: `
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
    });
    console.log(`Password reset email successfully sent to ${toEmail}`);
  } catch (error) {
    console.error("Failed to send password reset email:", error);
  }
}