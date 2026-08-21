import React, { useState } from "react";
import { loginSchema } from "shared";
import { api } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { GlassCard } from "../components/GlassCard";

export const LoginPage: React.FC = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setServerError("");

    const validation = loginSchema.safeParse(formData);
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0].toString()] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.post("/auth/login", formData);
      localStorage.setItem("token", response.data.token);
      window.location.href = "/dashboard";
    } catch (err: any) {
      setServerError(err.response?.data?.error || "Invalid email or password.");
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
            {/* User Head & Shoulders Icon */}
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
              {/* Lock Icon */}
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
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Footer Link to Register */}
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
    </AuthLayout>
  );
};