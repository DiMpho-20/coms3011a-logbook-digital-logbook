import React, { useState } from "react";
import { loginSchema } from "@logbook/shared";
import { api } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { GlassCard } from "../components/GlassCard";

export const LoginPage: React.FC = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 2FA state
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  // Proof that the password step of this sign-in succeeded. The second step
  // sends this instead of the email address, so a code on its own is no
  // longer enough to get in (BUG-006).
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  // Scheduled-deletion state
  const [scheduledDeletionAt, setScheduledDeletionAt] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<{ fullName: string; email: string } | null>(null);

  // Query-string flags
  const [sessionExpired] = useState(() =>
    new URLSearchParams(window.location.search).has("expired")
  );
  const [deletionScheduledBanner] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get("deletionScheduled");
    return raw ? decodeURIComponent(raw) : null;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError("");

    const validation = loginSchema.safeParse(formData);
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
      const response = await api.post("/auth/login", formData);
      
      // Check if 2FA is required
      if (response.data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setTwoFactorToken(response.data.twoFactorToken);
        return;
      }

      // If a deletion is scheduled, don't log in yet — show the modal.
      if (response.data.scheduledDeletionAt) {
        setPendingToken(response.data.token);
        setPendingUser(response.data.user);
        setScheduledDeletionAt(response.data.scheduledDeletionAt);
        return;
      }
      
      localStorage.setItem("token", response.data.token);
      if (response.data.user) {
        localStorage.setItem("logbook-name", response.data.user.fullName);
        localStorage.setItem("logbook-email", response.data.user.email);
      }
      window.location.href = "/dashboard";
    } catch (err: any) {
      setServerError(err.response?.data?.error || "Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError("");

    const valid = useRecoveryCode
      ? /^[A-Z0-9]{5}-?[A-Z0-9]{5}$/.test(twoFactorCode.toUpperCase())
      : /^\d{6}$/.test(twoFactorCode);

    if (!valid) {
      setErrors({
        code: useRecoveryCode
          ? "Recovery codes look like XXXXX-XXXXX"
          : "Please enter a valid 6-digit code",
      });
      return;
    }

    if (!twoFactorToken) {
      setServerError("Your sign-in session has expired. Please sign in again.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.post("/auth/login/2fa", {
        twoFactorToken,
        code: twoFactorCode,
      });

      // A recovery code is spent by using it. Say so plainly rather than
      // letting them find out when the last one silently fails.
      if (response.data.usedRecoveryCode) {
        const left = response.data.recoveryCodesRemaining ?? 0;
        localStorage.setItem(
          "logbook-recovery-notice",
          left === 0
            ? "You just used your last recovery code. Generate a new set in Settings."
            : `Recovery code used. You have ${left} left.`
        );
      }

      if (response.data.scheduledDeletionAt) {
        setPendingToken(response.data.token);
        setPendingUser(response.data.user);
        setScheduledDeletionAt(response.data.scheduledDeletionAt);
        return;
      }
      
      localStorage.setItem("token", response.data.token);
      if (response.data.user) {
        localStorage.setItem("logbook-name", response.data.user.fullName);
        localStorage.setItem("logbook-email", response.data.user.email);
      }
      window.location.href = "/dashboard";
    } catch (err: any) {
      setServerError(err.response?.data?.error || "Invalid authentication code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelDeletion = async () => {
    if (!pendingToken || !pendingUser) return;
    try {
      setIsSubmitting(true);
      // Temporarily set the token so the api client attaches it.
      localStorage.setItem("token", pendingToken);
      await api.post("/auth/account/cancel-deletion");
      // Now complete the login normally.
      localStorage.setItem("logbook-name", pendingUser.fullName);
      localStorage.setItem("logbook-email", pendingUser.email);
      window.location.href = "/dashboard";
    } catch (err: any) {
      localStorage.removeItem("token");
      setServerError(err.response?.data?.error || "Failed to cancel deletion.");
      setScheduledDeletionAt(null);
      setPendingToken(null);
      setPendingUser(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const keepDeletion = () => {
    setScheduledDeletionAt(null);
    setPendingToken(null);
    setPendingUser(null);
  };

  return (
    <AuthLayout>
      {/* Back to home */}
      <a
        href="/"
        style={{
          position: "absolute",
          top: "1.5rem",
          left: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          color: "rgba(255, 255, 255, 0.6)",
          fontSize: "0.85rem",
          textDecoration: "none",
          transition: "color 0.2s",
          zIndex: 20,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#00c6ff")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255, 255, 255, 0.6)")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        Back to home
      </a>
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
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
            Welcome Back
          </h2>
          <p style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", marginTop: "0.35rem" }}>
            Sign in to access your dashboard
          </p>
        </div>

        {/* Deletion scheduled banner */}
        {deletionScheduledBanner && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.65rem",
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              color: "#fcd34d",
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              fontSize: "0.85rem",
              lineHeight: 1.45,
              marginBottom: "1.25rem",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fcd34d"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: "1px" }}
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              Your account will be permanently deleted in 30 days, on{" "}
              <strong style={{ color: "#ffffff" }}>
                {new Date(deletionScheduledBanner).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              . Log in before then to cancel.
            </span>
          </div>
        )}

        {/* Session Expired Banner */}
        {sessionExpired && (
          <div
            style={{
              backgroundColor: "rgba(0, 198, 255, 0.12)",
              border: "1px solid rgba(0, 198, 255, 0.35)",
              color: "#7dd3fc",
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              fontSize: "0.875rem",
              marginBottom: "1.25rem",
              textAlign: "center",
            }}
          >
            Your session has expired. Please sign in again.
          </div>
        )}

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

        {/* 2FA Code Form (shown after password verification) */}
        {requiresTwoFactor ? (
          <form onSubmit={handleTwoFactorSubmit}>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  margin: "0 auto 0.75rem auto",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, rgba(0, 198, 255, 0.15), rgba(140, 60, 255, 0.2))",
                  border: "1px solid rgba(0, 198, 255, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#00c6ff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p style={{ fontSize: "0.9rem", color: "rgba(255, 255, 255, 0.85)", margin: 0 }}>
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

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
                {useRecoveryCode ? "Recovery Code" : "Authentication Code"}
              </label>
              <input
                type="text"
                inputMode={useRecoveryCode ? "text" : "numeric"}
                maxLength={useRecoveryCode ? 11 : 6}
                placeholder={useRecoveryCode ? "XXXXX-XXXXX" : "000000"}
                value={twoFactorCode}
                onChange={(e) =>
                  setTwoFactorCode(
                    useRecoveryCode
                      ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "")
                      : e.target.value.replace(/\D/g, "")
                  )
                }
                autoFocus
                style={{
                  width: "100%",
                  padding: "0.85rem 1rem",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: errors.code
                    ? "1px solid rgba(239, 68, 68, 0.6)"
                    : "1px solid rgba(255, 255, 255, 0.18)",
                  background: "rgba(10, 20, 50, 0.45)",
                  color: "#ffffff",
                  fontSize: "1.25rem",
                  letterSpacing: useRecoveryCode ? "0.15rem" : "0.5rem",
                  textAlign: "center",
                  outline: "none",
                  transition: "all 0.2s ease-in-out",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#00c6ff";
                  e.target.style.boxShadow = "0 0 12px rgba(0, 198, 255, 0.3)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = errors.code
                    ? "rgba(239, 68, 68, 0.6)"
                    : "rgba(255, 255, 255, 0.18)";
                  e.target.style.boxShadow = "none";
                }}
              />
              {errors.code && (
                <small
                  style={{
                    color: "#fca5a5",
                    fontSize: "0.78rem",
                    marginTop: "0.35rem",
                    display: "block",
                  }}
                >
                  {errors.code}
                </small>
              )}

              <button
                type="button"
                onClick={() => {
                  setUseRecoveryCode((v) => !v);
                  setTwoFactorCode("");
                  setErrors({});
                  setServerError("");
                }}
                style={{
                  marginTop: "0.6rem",
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "#7cc4ff",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {useRecoveryCode
                  ? "Use your authenticator app instead"
                  : "Lost your device? Use a recovery code"}
              </button>
            </div>

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
              {isSubmitting ? "Verifying..." : "Verify & Sign In"}
            </button>

            <button
              type="button"
              onClick={() => {
                setRequiresTwoFactor(false);
                setTwoFactorCode("");
                setTwoFactorToken("");
                setUseRecoveryCode(false);
                setServerError("");
                setErrors({});
              }}
              style={{
                width: "100%",
                padding: "0.75rem",
                marginTop: "0.75rem",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "transparent",
                color: "rgba(255, 255, 255, 0.7)",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(0, 198, 255, 0.4)";
                e.currentTarget.style.color = "#00c6ff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
              }}
            >
              Use a different account
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
          {/* Email Field with Left Icon */}
          <div style={{ marginBottom: "1.25rem" }}>
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
                  stroke={errors.email ? "#fca5a5" : "#00c6ff"}
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
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem 0.75rem 2.6rem",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: errors.email
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
                  e.target.style.borderColor = errors.email
                    ? "rgba(239, 68, 68, 0.6)"
                    : "rgba(255, 255, 255, 0.18)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
            {errors.email && (
              <small
                style={{
                  color: "#fca5a5",
                  fontSize: "0.78rem",
                  marginTop: "0.35rem",
                  display: "block",
                }}
              >
                {errors.email}
              </small>
            )}
          </div>

          {/* Password Field with Left Icon */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <label
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: "rgba(255, 255, 255, 0.9)",
                }}
              >
                Password
              </label>
              <a
                href="/forgot-password"
                style={{
                  fontSize: "0.8rem",
                  color: "#a0a5ff",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#00c6ff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#a0a5ff")}
              >
                Forgot password?
              </a>
            </div>

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
                  stroke={errors.password ? "#fca5a5" : "#00c6ff"}
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
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem 0.75rem 2.6rem",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: errors.password
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
                  e.target.style.borderColor = errors.password
                    ? "rgba(239, 68, 68, 0.6)"
                    : "rgba(255, 255, 255, 0.18)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
            {errors.password && (
              <small
                style={{
                  color: "#fca5a5",
                  fontSize: "0.78rem",
                  marginTop: "0.35rem",
                  display: "block",
                }}
              >
                {errors.password}
              </small>
            )}
          </div>

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
            {isSubmitting ? "Signing in..." : "Sign In"}
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
          Don't have an account?{" "}
          <a
            href="/register"
            style={{
              color: "#00c6ff",
              fontWeight: 600,
              textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            Sign Up
          </a>
        </p>
      </GlassCard>

      {/* Scheduled deletion modal (shown when logging in during grace period) */}
      {scheduledDeletionAt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              maxWidth: "440px",
              width: "100%",
              background: "linear-gradient(180deg, #0d1b3e 0%, #0a1628 100%)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "16px",
              padding: "1.75rem",
              color: "#ffffff",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
              Account scheduled for deletion
            </h3>
            <p
              style={{
                marginTop: "0.75rem",
                marginBottom: "1.5rem",
                fontSize: "0.9rem",
                color: "rgba(255, 255, 255, 0.75)",
                lineHeight: 1.5,
              }}
            >
              Your account is scheduled for permanent deletion on{" "}
              <strong style={{ color: "#ffffff" }}>
                {new Date(scheduledDeletionAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              . Do you want to cancel the deletion?
            </p>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={cancelDeletion}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "none",
                  background: "linear-gradient(135deg, #0072ff 0%, #7000ff 100%)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? "Cancelling..." : "Cancel deletion"}
              </button>
              <button
                onClick={keepDeletion}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  background: "transparent",
                  color: "rgba(255, 255, 255, 0.85)",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                }}
              >
                Keep deletion
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
};