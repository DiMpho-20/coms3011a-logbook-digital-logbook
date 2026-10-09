import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  ShieldCheck,
  KeyRound,
  Clock,
  FolderKanban,
  BarChart3,
  Bell,
  History,
  BookOpen,
  UserPlus,
  MailCheck,
  PenLine,
  Download,
  type LucideIcon,
} from "lucide-react";
import { prefersReducedMotion } from "../lib/motion";

/* ── What the book pages through ─────────────────────────────────
   Each feature fills one spread: a small sketch of the screen on the
   left page, and what it does on the right. */

interface Feature {
  icon: LucideIcon;
  title: string;
  text: string;
  sketch: ReactNode;
}

const FEATURES: Feature[] = [
  {
    icon: FolderKanban,
    title: "Projects your way",
    text: "Design each project's entries with your own fields: numbers, checklists, links and fields that calculate themselves.",
    sketch: (
      <div className="login-sketch-card">
        <p className="login-sketch-heading">Entry format</p>
        {[["Hours", "Number"], ["Done", "Checklist"], ["Notes", "Text"], ["Rate", "Computed"]].map(([name, type]) => (
          <div key={name} className="login-sketch-row">
            <span>{name}</span>
            <span className="login-sketch-chip">{type}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: BarChart3,
    title: "See your progress",
    text: "Time every entry with the stopwatch, then watch your hours add up in charts and your own saved statistics.",
    sketch: (
      <div className="login-sketch-card">
        <p className="login-sketch-heading">Hours this week</p>
        <div className="login-sketch-bars">
          {[40, 65, 30, 85, 55, 95, 70].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
        <p className="login-sketch-formula">SUM({"{Hours}"}) = 23.5</p>
      </div>
    ),
  },
  {
    icon: Bell,
    title: "Never miss a deadline",
    text: "Reminders for due dates and stalled work reach your device, and due dates sync to Google Calendar.",
    sketch: (
      <div className="login-sketch-card">
        <p className="login-sketch-heading">October</p>
        <div className="login-sketch-calendar">
          {Array.from({ length: 21 }, (_, i) => (
            <span key={i} className={i === 11 ? "is-due" : i === 4 ? "is-today" : ""} />
          ))}
        </div>
        <div className="login-sketch-toast">
          <Bell style={{ width: 9, height: 9 }} /> Report due tomorrow
        </div>
      </div>
    ),
  },
  {
    icon: History,
    title: "Nothing gets lost",
    text: "Log entries offline and they sync later. Every change is kept, so any earlier version can be restored.",
    sketch: (
      <div className="login-sketch-card">
        <p className="login-sketch-heading">Version history</p>
        {[["v3", "Today"], ["v2", "Monday"], ["v1", "Sep 12"]].map(([v, when], i) => (
          <div key={v} className={`login-sketch-row ${i === 0 ? "is-current" : ""}`}>
            <span>{v}</span>
            <span>{when}</span>
          </div>
        ))}
        <span className="login-sketch-button">Restore v2</span>
      </div>
    ),
  },
];

/* On the sign-up page the book shows a new student what happens next
   instead: one spread per step of getting started. */
const GETTING_STARTED: Feature[] = [
  {
    icon: UserPlus,
    title: "Create your account",
    text: "Your name, your email and a password. That's all it takes to open your logbook.",
    sketch: (
      <div className="login-sketch-card">
        <p className="login-sketch-heading">Create an account</p>
        {[["Full name", "✓"], ["Email", "✓"], ["Password", "••••••"]].map(([name, value]) => (
          <div key={name} className="login-sketch-row">
            <span>{name}</span>
            <span>{value}</span>
          </div>
        ))}
        <span className="login-sketch-button">Sign up</span>
      </div>
    ),
  },
  {
    icon: MailCheck,
    title: "Confirm your email",
    text: "We send you a link to make sure the address is yours. Open it and your account is ready.",
    sketch: (
      <div className="login-sketch-card">
        <p className="login-sketch-heading">Inbox</p>
        <div className="login-sketch-toast">
          <MailCheck style={{ width: 9, height: 9 }} /> Verify your email address
        </div>
        <span className="login-sketch-button">Verify email</span>
      </div>
    ),
  },
  {
    icon: FolderKanban,
    title: "Set up your first project",
    text: "Name it after a module, a research task or anything you track, and choose the fields each entry records.",
    sketch: (
      <div className="login-sketch-card">
        <p className="login-sketch-heading">New project</p>
        {[["Hours", "Number"], ["Done", "Checklist"], ["Notes", "Text"]].map(([name, type]) => (
          <div key={name} className="login-sketch-row">
            <span>{name}</span>
            <span className="login-sketch-chip">{type}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: PenLine,
    title: "Log your first entry",
    text: "Record what you worked on and for how long. Your dashboard starts adding it up straight away.",
    sketch: (
      <div className="login-sketch-card">
        <p className="login-sketch-heading">First entry</p>
        {[["Hours", "1.5"], ["Notes", "Read chapter 2"]].map(([name, value]) => (
          <div key={name} className="login-sketch-row">
            <span>{name}</span>
            <span>{value}</span>
          </div>
        ))}
        <div className="login-sketch-toast">
          <PenLine style={{ width: 9, height: 9 }} /> Entry saved
        </div>
      </div>
    ),
  },
];

interface Badge {
  icon: LucideIcon;
  color: string;
  text: string;
}

interface BookContent {
  features: Feature[];
  /** The last right-hand page, left showing once every page has turned. */
  finale: { icon: LucideIcon; title: string; text: string; cta: string };
  /** The three labels floating around the book. */
  badges: [Badge, Badge, Badge];
}

export type LoginStageVariant = "sign-in" | "sign-up";

const CONTENT: Record<LoginStageVariant, BookContent> = {
  "sign-in": {
    features: FEATURES,
    finale: {
      icon: ShieldCheck,
      title: "Your logbook awaits",
      text: "Sign in securely, with two-factor authentication if you want it, and pick up where you left off.",
      cta: "Sign in to begin →",
    },
    badges: [
      { icon: ShieldCheck, color: "#34d399", text: "Secure sign-in" },
      { icon: KeyRound, color: "#c4b5fd", text: "2FA ready" },
      { icon: Clock, color: "#00c6ff", text: "Pick up where you left off" },
    ],
  },
  "sign-up": {
    features: GETTING_STARTED,
    finale: {
      icon: BookOpen,
      title: "Your logbook starts here",
      text: "Four small steps and you're recording your work, with every change kept and nothing lost.",
      cta: "Create your account →",
    },
    badges: [
      { icon: MailCheck, color: "#34d399", text: "Email-verified account" },
      { icon: KeyRound, color: "#c4b5fd", text: "2FA when you want it" },
      { icon: Download, color: "#00c6ff", text: "Export your data anytime" },
    ],
  },
};

const HOLD_CLOSED_MS = 2000;
const HOLD_OPEN_MS = 3800;

function PageNumber({ n }: { n: number }) {
  return <span className="login-page-number">{n}</span>;
}

/* A solid logbook built from six CSS faces, floating over a glowing platform.
   Every so often it opens and pages through what the logbook can do. */
function Logbook3D({ variant }: { variant: LoginStageVariant }) {
  const { features, finale, badges } = CONTENT[variant];
  /* Steps: 0 closed · 1 cover open · 1 + n once n pages have turned. */
  const lastStep = features.length + 1;
  /* Long enough for every page and the cover to fall shut in turn. */
  const closingMs = 1400 + features.length * 150;
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const timer = window.setTimeout(
      () => {
        if (closing) {
          setClosing(false);
        } else if (step === lastStep) {
          setClosing(true);
          setStep(0);
        } else {
          setStep(step + 1);
        }
      },
      closing ? closingMs : step === 0 ? HOLD_CLOSED_MS : HOLD_OPEN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [step, closing, paused, lastStep, closingMs]);

  const open = step > 0;
  const leafStyle = (index: number, flipped: boolean) => ({
    // Turned pages stack in reverse on the left, so each sits on the one
    // before it, above the open cover; the offsets swap sign as the leaf rotates.
    transform: `rotateY(${flipped ? -180 : 0}deg) translateZ(${-(index + 1) * 1.2}px)`,
    // Shut the book from the top page down when it closes.
    transitionDelay: closing ? `${(features.length - 1 - index) * 150}ms` : "0ms",
  });

  return (
    <div
      className={`login-scene ${open ? "is-open" : ""} ${closing ? "is-closing" : ""}`}
      aria-hidden="true"
      data-step={step}
    >
      <div className="login-platform" />
      <div className="login-book-float">
        <div className="login-book-turn">
          <div
            className="login-book"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
          >
            {/* The cover is a leaf hinged on the spine: outside, then inside. */}
            <div
              className="login-leaf login-cover"
              style={{
                transform: `translateZ(23px) rotateY(${open ? -180 : 0}deg)`,
                transitionDelay: closing ? `${features.length * 150}ms` : "0ms",
              }}
            >
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
              <div className="login-leaf-back login-cover-inside">{features[0].sketch}</div>
            </div>
  
            {/* The pages, each a leaf: a feature on the front, and on the back
                the sketch that goes with the next feature. */}
            <div className="login-page-block">
              {features.map((feature, i) => (
                <div key={feature.title} className="login-leaf login-page" style={leafStyle(i, step >= i + 2)}>
                  <div className="login-leaf-front login-paper">
                    <div className="login-page-icon">
                      <feature.icon style={{ width: 18, height: 18 }} />
                    </div>
                    <p className="login-page-title">{feature.title}</p>
                    <p className="login-page-text">{feature.text}</p>
                    <PageNumber n={i * 2 + 1} />
                  </div>
                  <div className="login-leaf-back login-paper">
                    {features[i + 1]?.sketch ?? (
                      <div className="login-page-final-sketch">
                        <BookOpen style={{ width: 40, height: 40 }} />
                      </div>
                    )}
                    <PageNumber n={i * 2 + 2} />
                  </div>
                </div>
              ))}
  
              {/* Under every page: the last right-hand page. */}
              <div className="login-paper login-page-last" style={{ transform: `translateZ(${-(features.length + 1) * 1.2}px)` }}>
                <div className="login-page-icon">
                  <finale.icon style={{ width: 18, height: 18 }} />
                </div>
                <p className="login-page-title">{finale.title}</p>
                <p className="login-page-text">{finale.text}</p>
                <p className="login-page-cta">{finale.cta}</p>
              </div>
            </div>
  
            <div className="login-book-face login-book-back" />
            <div className="login-book-face login-book-spine" />
            <div className="login-book-face login-book-pages" />
            <div className="login-book-face login-book-top" />
            <div className="login-book-face login-book-bottom" />
          </div>
        </div>
      </div>

      {badges.map((badge, i) => (
        <div key={badge.text} className={`login-float-badge login-float-badge-${i + 1}`}>
          <badge.icon style={{ width: "16px", height: "16px", color: badge.color }} />
          {badge.text}
        </div>
      ))}
    </div>
  );
}

/* Lays the 3D logbook beside an auth card and turns both toward the pointer.
   The sign-up page passes variant="sign-up" to page through getting started. */
export function LoginStage3D({ children, variant = "sign-in" }: { children: ReactNode; variant?: LoginStageVariant }) {
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
      <Logbook3D variant={variant} />
      <div className="login-card-wrap">
        <div className="login-card-3d">{children}</div>
      </div>
    </div>
  );
}
