import React, { useState, useEffect } from "react";
import { resetPasswordSchema } from "@logbook/shared";
import { api } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { GlassCard } from "../components/GlassCard";

export const ResetPasswordPage: React.FC = () => {
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasTokenInUrl, setHasTokenInUrl] = useState(true);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = queryParams.get("token");
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    } else {
      setHasTokenInUrl(false);
      setServerError("Invalid or missing password reset link. Please request a new one.");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError("");
    setSuccessMsg("");

    const validation = resetPasswordSchema.safeParse({ token, newPassword });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue: { path: PropertyKey[]; message: string }) => {
        if (issue.path[0]) fieldErrors[issue.path[0].toString()] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.post("/auth/reset-password", { token, newPassword });
      setSuccessMsg(response.data.message || "Password successfully reset!");
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (err: any) {
      setServerError(
        err.response?.data?.error || "Failed to reset password. Link may be expired."
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
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
            Set New Password
          </h2>
          <p style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", marginTop: "0.35rem" }}>
            Enter your new password below
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

        {hasTokenInUrl && (
          <form onSubmit={handleSubmit}>
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
                New Password
              </label>
              <div style={{ position: "relative" }}>
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
                    stroke={errors.newPassword ? "#fca5a5" : "#00c6ff"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>

                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem 0.75rem 2.6rem",
                    boxSizing: "border-box",
                    borderRadius: "10px",
                    border: errors.newPassword
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
                    e.target.style.borderColor = errors.newPassword
                      ? "rgba(239, 68, 68, 0.6)"
                      : "rgba(255, 255, 255, 0.18)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
              {errors.newPassword && (
                <small
                  style={{
                    color: "#fca5a5",
                    fontSize: "0.78rem",
                    marginTop: "0.35rem",
                    display: "block",
                  }}
                >
                  {errors.newPassword}
                </small>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !!successMsg}
              style={{
                width: "100%",
                padding: "0.85rem",
                borderRadius: "10px",
                border: "none",
                background: "linear-gradient(135deg, #0072ff 0%, #7000ff 100%)",
                color: "#ffffff",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: isSubmitting || !!successMsg ? "not-allowed" : "pointer",
                boxShadow: "0 4px 15px rgba(0, 114, 255, 0.4)",
                transition: "transform 0.15s ease, boxShadow 0.15s ease",
                opacity: isSubmitting || !!successMsg ? 0.7 : 1,
              }}
            >
              {isSubmitting ? "Resetting..." : successMsg ? "Reset!" : "Reset Password"}
            </button>
          </form>
        )}

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
          >
            Sign In
          </a>
        </p>
      </GlassCard>
    </AuthLayout>
  );
};