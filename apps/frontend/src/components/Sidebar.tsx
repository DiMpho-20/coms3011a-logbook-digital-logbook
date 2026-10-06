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
  ChevronLeft,
  ChevronRight,
  X,
  Circle,
  BarChart3,
  CalendarDays,
  Kanban,
  Bell,
  GraduationCap,
} from "lucide-react";
import { clearOfflineCache } from "../lib/offlineCache";
import { fetchDueReminderCount, fetchDueReminders, REMINDERS_CHANGED_EVENT } from "../api";
import {
  disableReminderNotifications,
  notifyNewDueReminders,
  reminderNotificationMode,
} from "../lib/reminderNotifications";

/** How often the due-reminder badge re-checks while the app is open. */
const REMINDER_POLL_MS = 5 * 60_000;

/**
 * Pending reminders whose time has come. Polls so a reminder that falls due
 * while the app sits open still shows up, and refreshes straight away when
 * the reminders page changes something. When device notifications are on,
 * each newly due reminder also gets a system notification.
 */
function useDueReminderCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      // When this tab does the notifying, the full list is needed to spot new ones.
      const due = reminderNotificationMode() === "in-app"
        ? fetchDueReminders().then(async (list) => {
            await notifyNewDueReminders(list);
            return list.length;
          })
        : fetchDueReminderCount();
      due
        .then((n) => { if (!cancelled) setCount(n); })
        .catch(() => {});
    };
    // Each check runs the student's reminder rules on the server, so a hidden
    // tab skips it, unless this tab is the one showing device notifications,
    // which must keep arriving in the background. Coming back checks at once.
    const poll = () => {
      if (document.hidden && reminderNotificationMode() !== "in-app") return;
      refresh();
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    refresh();
    const timer = window.setInterval(poll, REMINDER_POLL_MS);
    window.addEventListener(REMINDERS_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return count;
}

interface SidebarProps {
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * Grouped by what the student is doing: what's happening now, the logbook
 * work itself, and their studies. Profile and Settings live in the account
 * menu at the bottom, so the list stays short enough to scan.
 */
const NAV_GROUPS = [
  {
    label: "Today",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/reminders", label: "Reminders", icon: Bell, end: false },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, end: false },
    ],
  },
  {
    label: "Work",
    items: [
      { to: "/projects", label: "Projects", icon: FolderKanban, end: false },
      { to: "/entries", label: "Entries", icon: ClipboardList, end: false },
      { to: "/open-work", label: "Open Work", icon: Circle, end: false },
      { to: "/board", label: "Board", icon: Kanban, end: false },
      { to: "/stats", label: "Statistics", icon: BarChart3, end: false },
    ],
  },
  {
    label: "Academics",
    items: [{ to: "/grades", label: "My Grades", icon: GraduationCap, end: false }],
  },
];

export default function Sidebar({ onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dueReminders = useDueReminderCount();

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
    <nav
      aria-label="Primary"
      className={`sidebar-root ${collapsed ? "w-16" : "w-60"} flex flex-col h-full shrink-0 relative overflow-hidden transition-[width] duration-200`}
      style={{ background: "linear-gradient(180deg, #0a1628 0%, #0d1b3e 100%)" }}
    >
      {/* Brand area */}
      <div className={`relative z-10 flex items-center gap-2.5 h-16 shrink-0 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        <div className="relative p-1.5 rounded-lg" style={{ background: "linear-gradient(135deg, #0072ff, #7000ff)" }}>
          <BookOpen className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-white tracking-tight">
            Digital Logbook
          </span>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`${collapsed ? "absolute -right-3 top-5" : "ml-auto"} hidden lg:flex p-1 rounded-md border border-white/10 bg-[#101d38] text-slate-400 hover:text-white hover:bg-white/10 transition`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
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

      {/* Main navigation, in groups */}
      <nav className={`relative z-10 flex-1 overflow-y-auto pt-4 ${collapsed ? "px-2" : "px-3"}`} aria-label="Main">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? "mt-4" : undefined}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-2 mb-3 h-px bg-white/[0.06]" aria-hidden="true" />
            ) : (
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `sidebar-nav-item flex items-center ${collapsed ? "justify-center px-2" : "gap-2.5 px-3"} py-2 rounded-lg text-sm font-medium transition-all duration-200 relative ${
                      isActive
                        ? "sidebar-nav-active text-white"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                    }`
                  }
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="sidebar-active-bar absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" />
                      )}
                      <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-cyan-400" : ""}`} />
                      {!collapsed && item.label}
                      {item.to === "/reminders" && dueReminders > 0 && (
                        <span
                          className={`${collapsed ? "absolute top-1 right-1 h-2 w-2 p-0" : "ml-auto px-1.5 py-0.5 text-[10px]"} rounded-full bg-amber-500 font-semibold text-white leading-none`}
                          aria-label={`${dueReminders} reminder${dueReminders === 1 ? "" : "s"} due`}
                        >
                          {!collapsed && dueReminders}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User area */}
      <div ref={menuRef} className="relative z-10 shrink-0 border-t border-white/[0.06]">
        {/* Dropdown menu */}
        {menuOpen && (
          <div className={`absolute bottom-full ${collapsed ? "left-2 w-56" : "left-3 right-3"} mb-1.5 rounded-xl shadow-2xl overflow-hidden z-30`}
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
              onClick={async () => {
                setMenuOpen(false);
                // Stop pushes to this device before the session ends.
                await disableReminderNotifications();
                localStorage.removeItem("token");
                clearOfflineCache();
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
          className={`w-full flex items-center gap-2.5 py-3 hover:bg-white/[0.04] transition text-left ${collapsed ? "justify-center px-2" : "px-4"}`}
          aria-label={collapsed ? "Open account menu" : undefined}
          title={collapsed ? "Open account menu" : undefined}
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
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{displayName}</p>
                <p className="text-[10px] text-slate-500 truncate">Student</p>
              </div>
              <ChevronUp
                className={`h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform duration-200 ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
