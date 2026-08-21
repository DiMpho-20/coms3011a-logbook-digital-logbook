import React, { useState, useEffect, useRef } from "react";
import { verifyEmailSchema } from "shared";
import { api } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { GlassCard } from "../components/GlassCard";

export const VerifyEmail: React.FC = () => {
  const [serverError, setServerError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isVerifying, setIsVerifying] = useState(true);
  
  // Guard against React 18 StrictMode executing twice
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    if (hasExecutedRef.current) return;

    const queryParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = queryParams.get("token");

    if (tokenFromUrl) {
      hasExecutedRef.current = true;
      executeVerification(tokenFromUrl);
    } else {
      setIsVerifying(false);
      setServerError("No verification token found in link.");
    }
  }, []);

  const executeVerification = async (verificationToken: string) => {
    setServerError("");
    setSuccessMsg("");

    const validation = verifyEmailSchema.safeParse({ token: verificationToken });
    if (!validation.success) {
      setServerError("Invalid verification token format.");
      setIsVerifying(false);
      return;
    }

    try {
      const response = await api.post("/auth/verify-email", { token: verificationToken });
      setSuccessMsg(response.data.message || "Email verified successfully! Redirecting...");
      
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (err: any) {
      setServerError(
        err.response?.data?.error || "Failed to verify email. Token may be invalid or expired."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <AuthLayout>
      <GlassCard>
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
              <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9" />
              <polyline points="22,6 12,13 2,6" />
              <path d="m16 19 2 2 4-4" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
            Email Verification
          </h2>
        </div>

        {isVerifying && (
          <p style={{ textAlign: "center", color: "rgba(255, 255, 255, 0.8)", fontSize: "0.95rem" }}>
            Verifying your email address...
          </p>
        )}

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

        <p
          style={{
            textAlign: "center",
            marginTop: "1.75rem",
            marginBottom: 0,
            fontSize: "0.85rem",
            color: "rgba(255, 255, 255, 0.7)",
          }}
        >
          <a
            href="/login"
            style={{
              color: "#00c6ff",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Go to Sign In
          </a>
        </p>
      </GlassCard>
    </AuthLayout>
  );
};