import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, FolderKanban, FileText, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "radial-gradient(ellipse at top, #0d1b3e 0%, #080c1d 60%, #03050a 100%)",
        color: "#ffffff",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Navigation Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "rgba(10, 20, 50, 0.6)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          padding: "1rem 1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "1150px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            to="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              textDecoration: "none",
            }}
          >
            <img
              src="/ProjectLogo.png"
              alt="ProjectLog Logo"
              style={{ height: "36px", width: "auto", objectFit: "contain" }}
            />
            <span
              style={{
                fontWeight: 800,
                fontSize: "1.25rem",
                letterSpacing: "-0.025em",
                color: "#ffffff",
              }}
            >
              Project<span style={{ color: "#00c6ff" }}>Log</span>
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Link
              to="/login"
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.8)",
                textDecoration: "none",
                transition: "color 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#00c6ff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)")}
            >
              Sign In
            </Link>
            <Link
              to="/register"
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#ffffff",
                background: "linear-gradient(135deg, #0072ff 0%, #7000ff 100%)",
                padding: "0.5rem 1.15rem",
                borderRadius: "10px",
                textDecoration: "none",
                boxShadow: "0 0 15px rgba(0, 114, 255, 0.35)",
                transition: "transform 0.15s ease, boxShadow 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 0 20px rgba(112, 0, 255, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 0 15px rgba(0, 114, 255, 0.35)";
              }}
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        {/* Hero Section */}
        <section
          style={{
            position: "relative",
            padding: "5rem 1.5rem 6rem 1.5rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            overflow: "hidden",
          }}
        >
          {/* Ambient Background Glow Orb */}
          <div
            style={{
              position: "absolute",
              top: "20%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "500px",
              height: "300px",
              background: "radial-gradient(circle, rgba(112, 0, 255, 0.25) 0%, rgba(0, 198, 255, 0.1) 60%, rgba(0,0,0,0) 100%)",
              filter: "blur(80px)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          <div
            style={{
              position: "relative",
              zIndex: 1,
              maxWidth: "850px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            {/* Pill Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 0.9rem",
                borderRadius: "9999px",
                backgroundColor: "rgba(0, 198, 255, 0.1)",
                border: "1px solid rgba(0, 198, 255, 0.3)",
                color: "#00c6ff",
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginBottom: "1.5rem",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#00c6ff",
                  boxShadow: "0 0 8px #00c6ff",
                }}
              />
              Track • Build • Grow
            </div>

            {/* Headline */}
            <h1
              style={{
                fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
                margin: "0 0 1.25rem 0",
              }}
            >
              Your Projects,{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #00c6ff 0%, #0072ff 50%, #8c3cff 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Digitized
              </span>{" "}
              and Organized.
            </h1>

            {/* Subtext */}
            <p
              style={{
                fontSize: "clamp(1rem, 2vw, 1.2rem)",
                color: "rgba(255, 255, 255, 0.75)",
                maxWidth: "680px",
                margin: "0 auto 2.25rem auto",
                lineHeight: 1.6,
                fontWeight: 400,
              }}
            >
              A structured digital logbook to track project milestones, document progress, and manage your account seamlessly.
            </p>

            {/* CTA Buttons */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                gap: "1rem",
              }}
            >
              <Link
                to="/register"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#ffffff",
                  background: "linear-gradient(135deg, #0072ff 0%, #7000ff 100%)",
                  padding: "0.85rem 1.75rem",
                  borderRadius: "12px",
                  textDecoration: "none",
                  boxShadow: "0 4px 20px rgba(0, 114, 255, 0.4)",
                  transition: "transform 0.15s ease, boxShadow 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 6px 25px rgba(112, 0, 255, 0.55)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 20px rgba(0, 114, 255, 0.4)";
                }}
              >
                Get Started Free
                <ArrowRight style={{ width: "20px", height: "20px" }} />
              </Link>

              <Link
                to="/dashboard"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#00c6ff",
                  backgroundColor: "rgba(0, 198, 255, 0.08)",
                  border: "1px solid rgba(0, 198, 255, 0.3)",
                  padding: "0.85rem 1.75rem",
                  borderRadius: "12px",
                  textDecoration: "none",
                  backdropFilter: "blur(8px)",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 198, 255, 0.16)";
                  e.currentTarget.style.borderColor = "rgba(0, 198, 255, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 198, 255, 0.08)";
                  e.currentTarget.style.borderColor = "rgba(0, 198, 255, 0.3)";
                }}
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </section>

        {/* Feature Cards Section */}
        <section style={{ padding: "4rem 1.5rem", maxWidth: "1150px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", maxWidth: "650px", margin: "0 auto 3rem auto" }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
              Built for Clear, Verifiable Progress
            </h2>
            <p
              style={{
                fontSize: "0.95rem",
                color: "rgba(255, 255, 255, 0.7)",
                marginTop: "0.5rem",
                lineHeight: 1.5,
              }}
            >
              Replace scattered notes and physical logs with a centralized, secure digital workspace tailored for project tracking.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {/* Card 1 */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                backdropFilter: "blur(16px)",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                padding: "1.75rem",
                boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
                transition: "transform 0.2s ease, borderColor 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = "rgba(0, 198, 255, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, rgba(0, 198, 255, 0.2), rgba(112, 0, 255, 0.2))",
                  border: "1px solid rgba(0, 198, 255, 0.3)",
                  color: "#00c6ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1.25rem",
                }}
              >
                <ShieldCheck style={{ width: "24px", height: "24px" }} />
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "#ffffff" }}>
                Secure Account Access
              </h3>
              <p style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.6, margin: 0 }}>
                Seamless registration, authentication, and self-service password management controls built for data safety.
              </p>
            </div>

            {/* Card 2 */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                backdropFilter: "blur(16px)",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                padding: "1.75rem",
                boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
                transition: "transform 0.2s ease, borderColor 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = "rgba(0, 198, 255, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, rgba(0, 198, 255, 0.2), rgba(112, 0, 255, 0.2))",
                  border: "1px solid rgba(0, 198, 255, 0.3)",
                  color: "#00c6ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1.25rem",
                }}
              >
                <FolderKanban style={{ width: "24px", height: "24px" }} />
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "#ffffff" }}>
                Project Workspaces
              </h3>
              <p style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.6, margin: 0 }}>
                Categorize your work cleanly by specific projects, keeping activity histories isolated and organized.
              </p>
            </div>

            {/* Card 3 */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                backdropFilter: "blur(16px)",
                borderRadius: "16px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                padding: "1.75rem",
                boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
                transition: "transform 0.2s ease, borderColor 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.borderColor = "rgba(0, 198, 255, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, rgba(0, 198, 255, 0.2), rgba(112, 0, 255, 0.2))",
                  border: "1px solid rgba(0, 198, 255, 0.3)",
                  color: "#00c6ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1.25rem",
                }}
              >
                <FileText style={{ width: "24px", height: "24px" }} />
              </div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "#ffffff" }}>
                Digital Record Keeping
              </h3>
              <p style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.6, margin: 0 }}>
                Capture timestamped log entries and track developmental milestones over time with ease.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: "rgba(5, 10, 25, 0.8)",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          color: "rgba(255, 255, 255, 0.5)",
          fontSize: "0.85rem",
          padding: "2rem 1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "1150px",
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 700, color: "#ffffff" }}>ProjectLog</span>
            <span>•</span>
            <span style={{ color: "#00c6ff", fontFamily: "monospace", fontSize: "0.8rem" }}>
              v0.1 (Sprint 1)
            </span>
          </div>
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} Digital Logbook Team. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}