import React, { useState } from "react";
import { api } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { GlassCard } from "../components/GlassCard";

export const SettingsPage: React.FC = () => {
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      setIsDeleting(true);
      await api.delete("/auth/account", { data: { confirmPassword } });
      localStorage.removeItem("token");
      setMessage("Account deleted successfully.");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to delete account.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AuthLayout>
      <div style={{ width: "100%", maxWidth: "520px" }}>
        <GlassCard>
          {/* Header Section */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                margin: "0 auto 1rem auto",
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(140, 60, 255, 0.25))",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px rgba(239, 68, 68, 0.25)",
              }}
            >
              {/* Gear / Settings Icon */}
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
              Account Settings
            </h2>
            <p style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", marginTop: "0.35rem" }}>
              Manage your account preferences and security
            </p>
          </div>

          {/* Danger Zone Box */}
          <div
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "12px",
              padding: "1.5rem",
              backdropFilter: "blur(4px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              {/* Warning Triangle Icon */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h3 style={{ margin: 0, color: "#fca5a5", fontSize: "1.1rem", fontWeight: 600 }}>
                Delete Account
              </h3>
            </div>

            <p
              style={{
                fontSize: "0.85rem",
                color: "rgba(255, 255, 255, 0.75)",
                marginTop: "0.25rem",
                marginBottom: "1.25rem",
                lineHeight: 1.4,
              }}
            >
              This action is permanent and cannot be undone. All associated data will be removed immediately.
            </p>

            {/* Error Banner */}
            {error && (
              <div
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.5)",
                  color: "#fca5a5",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  marginBottom: "1.25rem",
                }}
              >
                {error}
              </div>
            )}

            {/* Success Banner */}
            {message && (
              <div
                style={{
                  backgroundColor: "rgba(34, 197, 94, 0.2)",
                  border: "1px solid rgba(34, 197, 94, 0.5)",
                  color: "#86efac",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  marginBottom: "1.25rem",
                }}
              >
                {message}
              </div>
            )}

            <form onSubmit={handleDeleteAccount}>
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
                  Confirm Your Password
                </label>
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
                      stroke="rgba(255, 255, 255, 0.5)"
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
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem 0.75rem 2.6rem",
                      boxSizing: "border-box",
                      borderRadius: "10px",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      background: "rgba(10, 20, 50, 0.45)",
                      color: "#ffffff",
                      fontSize: "0.95rem",
                      outline: "none",
                      transition: "all 0.2s ease-in-out",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#ef4444";
                      e.target.style.boxShadow = "0 0 12px rgba(239, 68, 68, 0.35)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "rgba(255, 255, 255, 0.18)";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>

              {/* Danger Action Button */}
              <button
                type="submit"
                disabled={isDeleting}
                style={{
                  width: "100%",
                  padding: "0.85rem",
                  borderRadius: "10px",
                  border: "none",
                  background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 15px rgba(220, 38, 38, 0.4)",
                  transition: "transform 0.15s ease, boxShadow 0.15s ease",
                  opacity: isDeleting ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isDeleting) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(220, 38, 38, 0.6)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 15px rgba(220, 38, 38, 0.4)";
                }}
              >
                {isDeleting ? "Deleting Account..." : "Delete My Account"}
              </button>
            </form>
          </div>
        </GlassCard>
      </div>
    </AuthLayout>
  );
};