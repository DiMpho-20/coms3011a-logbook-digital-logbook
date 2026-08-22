import React, { useState } from "react";
import { forgotPasswordSchema } from "@logbook/shared";
import { api } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { GlassCard } from "../components/GlassCard";

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [mockToken, setMockToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setServerError("");
    setSuccessMsg("");
    setMockToken("");

    // Client-side validation using shared Zod schema
    const validation = forgotPasswordSchema.safeParse({ email });
    if (!validation.success) {
      const issue = validation.error.issues[0];
      setError(issue ? issue.message : "Invalid email address");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.post("/auth/forgot-password", { email });
      setSuccessMsg(response.data.message || "Reset link has been generated!");
      if (response.data.mockResetToken) {
        setMockToken(response.data.mockResetToken);
      }
    } catch (err: any) {
      setServerError(
        err.response?.data?.error || "Failed to process request. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <GlassCard>
        {/* Header Section */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              margin: "0 auto 1rem auto",
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(0, 198, 255, 0.2), rgba(140, 60, 255, 0.25))",
              border: "1px solid rgba(140, 60, 255, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(0, 198, 255, 0.25)",
            }}
          >
            {/* Key / Shield Icon */}
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00c6ff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="m21 2-9.6 9.6" />
              <path d="m15.5 7.5 3 3" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
            Forgot Password?
          </h2>
          <p style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", marginTop: "0.35rem" }}>
            Enter your account email to receive a password reset link
          </p>
        </div>

        {/* Server Error Banner */}
        {serverError && (
          <div
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              fontSize: "0.875rem",
              marginBottom: "1.25rem",
              textAlign: "center",
            }}
          >
            {serverError}
          </div>
        )}

        {/* Success Banner */}
        {successMsg && (
          <div
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              color: "#86efac",
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              fontSize: "0.875rem",
              marginBottom: "1.25rem",
              textAlign: "center",
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Dev Environment Helper Badge */}
        {mockToken && (
          <div
            style={{
              backgroundColor: "rgba(0, 198, 255, 0.1)",
              border: "1px dashed rgba(0, 198, 255, 0.4)",
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              marginBottom: "1.25rem",
              fontSize: "0.825rem",
              color: "rgba(255, 255, 255, 0.9)",
            }}
          >
            <div style={{ color: "#00c6ff", fontWeight: 600, marginBottom: "0.25rem" }}>
              🛠️ Dev Environment Helper:
            </div>
            <span style={{ color: "rgba(255, 255, 255, 0.7)" }}>Mock Reset Token: </span>
            <code
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                padding: "2px 6px",
                borderRadius: "4px",
                color: "#a7f3d0",
                fontSize: "0.85rem",
              }}
            >
              {mockToken}
            </code>
            <div style={{ marginTop: "0.5rem" }}>
              <a
                href={`/reset-password?token=${mockToken}`}
                style={{
                  color: "#00c6ff",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Click here to reset password →
              </a>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Email Field with Left Icon */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "rgba(255, 255, 255, 0.9)",
              }}
            >
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              {/* Mail Icon */}
              <div
                style={{
                  position: "absolute",
                  left: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={error ? "#fca5a5" : "#00c6ff"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>

              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem 0.75rem 2.6rem",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: error
                    ? "1px solid rgba(239, 68, 68, 0.6)"
                    : "1px solid rgba(255, 255, 255, 0.18)",
                  background: "rgba(10, 20, 50, 0.45)",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  outline: "none",
                  transition: "all 0.2s ease-in-out",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#00c6ff";
                  e.target.style.boxShadow = "0 0 12px rgba(0, 198, 255, 0.3)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = error
                    ? "rgba(239, 68, 68, 0.6)"
                    : "rgba(255, 255, 255, 0.18)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
            {error && (
              <small
                style={{
                  color: "#fca5a5",
                  fontSize: "0.78rem",
                  marginTop: "0.35rem",
                  display: "block",
                }}
              >
                {error}
              </small>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "0.85rem",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #0072ff 0%, #7000ff 100%)",
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              boxShadow: "0 4px 15px rgba(0, 114, 255, 0.4)",
              transition: "transform 0.15s ease, boxShadow 0.15s ease",
              opacity: isSubmitting ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(112, 0, 255, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(0, 114, 255, 0.4)";
            }}
          >
            {isSubmitting ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {/* Footer Link back to Login */}
        <p
          style={{
            textAlign: "center",
            marginTop: "1.75rem",
            marginBottom: 0,
            fontSize: "0.85rem",
            color: "rgba(255, 255, 255, 0.7)",
          }}
        >
          Remembered your password?{" "}
          <a
            href="/login"
            style={{
              color: "#00c6ff",
              fontWeight: 600,
              textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            Sign In
          </a>
        </p>
      </GlassCard>
    </AuthLayout>
  );
};