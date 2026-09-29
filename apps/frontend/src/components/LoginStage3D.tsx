import { useRef, type PointerEvent, type ReactNode } from "react";
import { ShieldCheck, KeyRound, Clock } from "lucide-react";
import { prefersReducedMotion } from "../lib/motion";

/* A solid logbook built from six CSS faces, floating over a glowing platform. */
function Logbook3D() {
  return (
    <div className="login-scene" aria-hidden="true">
      <div className="login-platform" />
      <div className="login-book-float">
        <div className="login-book">
          <div className="login-book-face login-book-front">
            <div className="login-book-ribbon" />
            <div className="login-book-label">
              <img src="/ProjectLogo.png" alt="" className="login-book-logo" />
            </div>
            <div className="login-book-subtitle">Digital Logbook</div>
            <div className="login-book-rule" />
            <div className="login-book-lines">
              <span style={{ width: "80%" }} />
              <span style={{ width: "62%" }} />
              <span style={{ width: "72%" }} />
            </div>
          </div>
          <div className="login-book-face login-book-back" />
          <div className="login-book-face login-book-spine" />
          <div className="login-book-face login-book-pages" />
          <div className="login-book-face login-book-top" />
          <div className="login-book-face login-book-bottom" />
        </div>
      </div>

      <div className="login-float-badge login-float-badge-1">
        <ShieldCheck style={{ width: "16px", height: "16px", color: "#34d399" }} />
        Secure sign-in
      </div>
      <div className="login-float-badge login-float-badge-2">
        <KeyRound style={{ width: "16px", height: "16px", color: "#c4b5fd" }} />
        2FA ready
      </div>
      <div className="login-float-badge login-float-badge-3">
        <Clock style={{ width: "16px", height: "16px", color: "#00c6ff" }} />
        Pick up where you left off
      </div>
    </div>
  );
}

/* Lays the 3D logbook beside an auth card and turns both toward the pointer. */
export function LoginStage3D({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    el.style.setProperty("--login-rx", `${-y * 18}deg`);
    el.style.setProperty("--login-ry", `${x * 26}deg`);
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--login-rx", "0deg");
    el.style.setProperty("--login-ry", "0deg");
  };

  return (
    <div ref={ref} className="login-stage" onPointerMove={handleMove} onPointerLeave={handleLeave}>
      <Logbook3D />
      <div className="login-card-wrap">
        <div className="login-card-3d">{children}</div>
      </div>
    </div>
  );
}
