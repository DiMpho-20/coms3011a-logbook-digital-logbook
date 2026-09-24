import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  Settings,
  BookOpen,
  LogOut,
  User as UserIcon,
  ChevronUp,
  X,
  Circle,
  BarChart3,
  CalendarDays,
  Kanban,
} from "lucide-react";

interface SidebarProps {
  onClose?: () => void;
}

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban, end: false },
  { to: "/entries", label: "Entries", icon: ClipboardList, end: false },
  { to: "/open-work", label: "Open Work", icon: Circle, end: false },
  { to: "/stats", label: "Stats", icon: BarChart3, end: false },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, end: false },
  { to: "/board", label: "Board", icon: Kanban, end: false },
];

const BOTTOM_ITEMS = [
  { to: "/profile", label: "Profile", icon: UserIcon },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ onClose }: SidebarProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName =
    typeof window !== "undefined"
      ? localStorage.getItem("logbook-name") || "Student"
      : "Student";
  const avatar =
    typeof window !== "undefined"
      ? localStorage.getItem("logbook-avatar") || ""
      : "";
  const initial = displayName.charAt(0).toUpperCase();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleNav = (path: string) => {
    setMenuOpen(false);
    onClose?.();
    navigate(path);
  };

  return (
    <aside
      className="sidebar-root w-60 flex flex-col h-full shrink-0 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0a1628 0%, #0d1b3e 100%)" }}
    >
      {/* Brand area */}
      <div className="relative z-10 flex items-center gap-2.5 px-5 h-16 shrink-0">
        <div className="relative p-1.5 rounded-lg" style={{ background: "linear-gradient(135deg, #0072ff, #7000ff)" }}>
          <BookOpen className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-tight">
          Digital Logbook
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Main navigation */}
      <nav className="relative z-10 flex-1 px-3 pt-4 space-y-0.5">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Main
        </p>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              `sidebar-nav-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative ${
                isActive
                  ? "sidebar-nav-active text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="sidebar-active-bar absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" />
                )}
                <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-cyan-400" : ""}`} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div className="relative z-10 mx-4 my-2 h-px bg-white/[0.06]" />

      {/* Personal section */}
      <div className="relative z-10 px-3 pb-2 space-y-0.5">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Personal
        </p>
        {BOTTOM_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `sidebar-nav-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative ${
                isActive
                  ? "sidebar-nav-active text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="sidebar-active-bar absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" />
                )}
                <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-cyan-400" : ""}`} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* User area */}
      <div ref={menuRef} className="relative z-10 shrink-0 border-t border-white/[0.06]">
        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-1.5 rounded-xl shadow-2xl overflow-hidden z-30"
            style={{ background: "linear-gradient(180deg, #1a2744, #141f38)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <button
              onClick={() => handleNav("/profile")}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white transition text-left"
            >
              <UserIcon className="h-4 w-4 text-cyan-400/70" /> Profile
            </button>
            <button
              onClick={() => handleNav("/settings")}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white transition text-left"
            >
              <Settings className="h-4 w-4 text-cyan-400/70" /> Settings
            </button>
            <div className="h-px bg-white/[0.06]" />
            <button
              onClick={() => {
                setMenuOpen(false);
                localStorage.removeItem("token");
                window.location.href = "/login";
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition text-left"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-white/[0.04] transition text-left"
        >
          <div className="shrink-0">
            {avatar ? (
              <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #0072ff, #7000ff)" }}
              >
                {initial}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">{displayName}</p>
            <p className="text-[10px] text-slate-500 truncate">Student</p>
          </div>
          <ChevronUp
            className={`h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform duration-200 ${
              menuOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    </aside>
  );
}
