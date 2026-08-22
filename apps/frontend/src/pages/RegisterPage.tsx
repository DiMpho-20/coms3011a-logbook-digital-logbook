import React, { useState } from "react";
import { registerSchema } from "@logbook/shared";
import { api } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { GlassCard } from "../components/GlassCard";

export const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({ fullName: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError("");
    setSuccessMsg("");

    // Client-side validation using shared Zod schema
    const validation = registerSchema.safeParse(formData);
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
      const response = await api.post("/auth/register", formData);
      
      // Save user info for profile pre-fill
      if (response.data.user) {
        localStorage.setItem("logbook-name", response.data.user.fullName);
        localStorage.setItem("logbook-email", response.data.user.email);
      }

      // Clear inputs and display email verification instruction banner
      setFormData({ fullName: "", email: "", password: "" });
      setSuccessMsg(
        response.data.message ||
          "Account registered! Please check your inbox and verify your email before signing in."
      );
    } catch (err: any) {
      console.error("Registration error:", err);
      const data = err.response?.data;
      const msg = data?.error
        || (data?.errors ? Object.values(data.errors).flat().join(", ") : null)
        || err.message
        || "Registration failed. Please try again.";
      setServerError(msg);
    } finally {
      setIsSubmitting(false);
    }
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
            {/* User Plus Icon */}
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="17" y1="11" x2="23" y2="11" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
            Create an Account
          </h2>
          <p style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", marginTop: "0.35rem" }}>
            Join us to get started with your account
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

        {/* Verification Success Banner */}
        {successMsg && (
          <div
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              color: "#86efac",
              padding: "0.85rem 1rem",
              borderRadius: "10px",
              fontSize: "0.875rem",
              marginBottom: "1.25rem",
              textAlign: "center",
              lineHeight: "1.4",
            }}
          >
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Full Name Field */}
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
              Full Name
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
                  stroke={errors.fullName ? "#fca5a5" : "#00c6ff"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>

              <input
                type="text"
                placeholder="John Doe"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem 0.75rem 2.6rem",
                  boxSizing: "border-box",
                  borderRadius: "10px",
                  border: errors.fullName
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
                  e.target.style.borderColor = errors.fullName
                    ? "rgba(239, 68, 68, 0.6)"
                    : "rgba(255, 255, 255, 0.18)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
            {errors.fullName && (
              <small
                style={{
                  color: "#fca5a5",
                  fontSize: "0.78rem",
                  marginTop: "0.35rem",
                  display: "block",
                }}
              >
                {errors.fullName}
              </small>
            )}
          </div>

          {/* Email Field */}
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

          {/* Password Field */}
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
              Password
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
            {isSubmitting ? "Registering..." : "Register"}
          </button>
        </form>

        {/* Footer Link to Login */}
        <p
          style={{
            textAlign: "center",
            marginTop: "1.75rem",
            marginBottom: 0,
            fontSize: "0.85rem",
            color: "rgba(255, 255, 255, 0.7)",
          }}
        >
          Already have an account?{" "}
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