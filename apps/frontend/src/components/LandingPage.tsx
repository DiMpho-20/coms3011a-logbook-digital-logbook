import { useRef, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  FolderKanban,
  FileText,
  ArrowRight,
  Clock,
  CheckCircle2,
  Tag,
  TrendingUp,
} from "lucide-react";
import { prefersReducedMotion } from "../lib/motion";

/* A card that leans toward the pointer, with a soft glare following it. */
function TiltCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--tilt-x", `${(0.5 - y) * 14}deg`);
    el.style.setProperty("--tilt-y", `${(x - 0.5) * 14}deg`);
    el.style.setProperty("--glare-x", `${x * 100}%`);
    el.style.setProperty("--glare-y", `${y * 100}%`);
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div className="landing-tilt-wrap">
      <div ref={ref} className="landing-tilt-card" onPointerMove={handleMove} onPointerLeave={handleLeave}>
        <div className="landing-tilt-glare" />
        {children}
      </div>
    </div>
  );
}

/* The floating logbook: layered panels pushed apart along the Z axis. */
function LogbookScene() {
  return (
    <div className="landing-scene" aria-hidden="true">
      <div className="landing-scene-float">
        <div className="landing-scene-rig">
          {/* Back layer: the project board */}
          <div className="landing-panel landing-panel-back">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Capstone Project</span>
              <span className="landing-chip">Sprint 4</span>
            </div>
            <div style={{ marginTop: "1rem", fontSize: "0.72rem", color: "rgba(255,255,255,0.6)" }}>
              Milestone progress
            </div>
            <div className="landing-progress">
              <div className="landing-progress-fill" />
            </div>
            <div className="landing-bars">
              {[40, 65, 50, 85, 70, 95, 60].map((h, i) => (
                <div key={i} className="landing-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
          </div>

          {/* Middle layer: log entries */}
          <div className="landing-panel landing-panel-mid">
            {[
              { title: "Set up CI pipeline", time: "09:12", done: true },
              { title: "Client meeting notes", time: "11:40", done: true },
              { title: "Draft sprint review", time: "14:05", done: false },
            ].map((entry) => (
              <div key={entry.title} className="landing-entry">
                <CheckCircle2
                  style={{
                    width: "16px",
                    height: "16px",
                    flexShrink: 0,
                    color: entry.done ? "#34d399" : "rgba(255,255,255,0.35)",
                  }}
                />
                <span style={{ flex: 1, fontSize: "0.8rem" }}>{entry.title}</span>
                <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
                  {entry.time}
                </span>
              </div>
            ))}
          </div>

          {/* Front layer: small badges closest to the viewer */}
          <div className="landing-badge landing-badge-timer">
            <Clock style={{ width: "16px", height: "16px", color: "#00c6ff" }} />
            <span style={{ fontFamily: "monospace", fontWeight: 700 }}>02:14:36</span>
          </div>
          <div className="landing-badge landing-badge-tag">
            <Tag style={{ width: "14px", height: "14px", color: "#c4b5fd" }} />
            <span>frontend</span>
          </div>
          <div className="landing-badge landing-badge-stat">
            <TrendingUp style={{ width: "16px", height: "16px", color: "#34d399" }} />
            <span>
              <strong>+24%</strong> this week
            </span>
          </div>
        </div>
      </div>
      <div className="landing-scene-shadow" />
    </div>
  );
}

const features = [
  {
    icon: ShieldCheck,
    title: "Secure Account Access",
    body: "Seamless registration, authentication, and self-service password management controls built for data safety.",
  },
  {
    icon: FolderKanban,
    title: "Project Workspaces",
    body: "Categorize your work cleanly by specific projects, keeping activity histories isolated and organized.",
  },
  {
    icon: FileText,
    title: "Digital Record Keeping",
    body: "Capture timestamped log entries and track developmental milestones over time with ease.",
  },
];

export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);

  // Turn the whole scene toward the pointer; CSS eases the movement.
  const handleHeroMove = (e: PointerEvent<HTMLElement>) => {
    const el = heroRef.current;
    if (!el || e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--scene-rx", `${-y * 16}deg`);
    el.style.setProperty("--scene-ry", `${x * 22}deg`);
  };

  const handleHeroLeave = () => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty("--scene-rx", "0deg");
    el.style.setProperty("--scene-ry", "0deg");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "radial-gradient(ellipse at top, #0d1b3e 0%, #080c1d 60%, #03050a 100%)",
        color: "#ffffff",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        overflowX: "hidden",
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
            <Link to="/register" className="landing-btn-3d landing-btn-3d-sm">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        {/* Hero Section */}
        <section
          ref={heroRef}
          className="landing-hero"
          onPointerMove={handleHeroMove}
          onPointerLeave={handleHeroLeave}
        >
          {/* Perspective grid floor receding into the distance */}
          <div className="landing-grid-floor" aria-hidden="true" />

          {/* Ambient Background Glow Orb */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "30%",
              left: "60%",
              transform: "translate(-50%, -50%)",
              width: "600px",
              height: "400px",
              maxWidth: "100vw",
              background:
                "radial-gradient(circle, rgba(112, 0, 255, 0.3) 0%, rgba(0, 198, 255, 0.12) 60%, rgba(0,0,0,0) 100%)",
              filter: "blur(80px)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
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
              <h1 className="landing-headline">
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
                  maxWidth: "560px",
                  margin: "0 0 2.25rem 0",
                  lineHeight: 1.6,
                  fontWeight: 400,
                }}
              >
                A structured digital logbook to track project milestones, document progress, and manage your account seamlessly.
              </p>

              {/* CTA Buttons */}
              <div className="landing-cta-row">
                <Link to="/register" className="landing-btn-3d">
                  Get Started Free
                  <ArrowRight style={{ width: "20px", height: "20px" }} />
                </Link>

                <Link to="/dashboard" className="landing-btn-ghost">
                  Go to Dashboard
                </Link>
              </div>
            </div>

            <LogbookScene />
          </div>
        </section>

        {/* Feature Cards Section */}
        <section style={{ padding: "4rem 1.5rem 5rem", maxWidth: "1150px", margin: "0 auto" }}>
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
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {features.map(({ icon: Icon, title, body }) => (
              <TiltCard key={title}>
                <div className="landing-feature-icon">
                  <Icon style={{ width: "24px", height: "24px" }} />
                </div>
                <h3
                  className="landing-lift"
                  style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "#ffffff" }}
                >
                  {title}
                </h3>
                <p
                  className="landing-lift-sm"
                  style={{ fontSize: "0.875rem", color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.6, margin: 0 }}
                >
                  {body}
                </p>
              </TiltCard>
            ))}
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
              v4 (Sprint 4)
            </span>
          </div>
          <p style={{ margin: 0 }}>
            © {new Date().getFullYear()} Digital Logbook Team. All rights reserved. ·{" "}
            <Link to="/privacy" style={{ color: "rgba(255, 255, 255, 0.7)" }}>Privacy Policy</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
