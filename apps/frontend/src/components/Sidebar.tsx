import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardList,
  Settings,
  BookOpen,
  LogOut,
  User as UserIcon,
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
import { endSession, fetchDueReminderCount, fetchDueReminders, REMINDERS_CHANGED_EVENT } from "../api";
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
 * work itself, their studies, and their own account. Every destination is a
 * link here, so each one shows where you are.
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
  {
    label: "Personal",
    items: [
      { to: "/profile", label: "Profile", icon: UserIcon, end: false },
      { to: "/settings", label: "Settings", icon: Settings, end: false },
    ],
  },
];

export default function Sidebar({ onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const dueReminders = useDueReminderCount();
  // On the desktop it is an inset panel; inside the phone drawer it fills the drawer.
  const inset = !onClose;

  const displayName =
    typeof window !== "undefined"
      ? localStorage.getItem("logbook-name") || "Student"
      : "Student";
  const avatar =
    typeof window !== "undefined"
      ? localStorage.getItem("logbook-avatar") || ""
      : "";
  const initial = displayName.charAt(0).toUpperCase();

  const logOut = async () => {
    // Stop pushes to this device before the session ends.
    await disableReminderNotifications();
    // Withdraw the token on the server too, while the header can still carry it.
    await endSession();
    localStorage.removeItem("token");
    clearOfflineCache();
    window.location.href = "/login";
  };

  const collapseButton = onToggleCollapse && (
    <button
      onClick={onToggleCollapse}
      className="hidden lg:flex rounded-md p-1 text-slate-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-slate-100"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronLeft className="h-4 w-4" aria-hidden="true" />}
    </button>
  );

  return (
    <div
      className={`sidebar-root flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-64"
      } ${inset ? "rounded-2xl border border-white/[0.08]" : ""}`}
    >
      {/* Brand area */}
      <div className={`flex shrink-0 items-center gap-2.5 pt-4 pb-3 ${collapsed ? "flex-col px-2" : "px-4"}`}>
        <div className="relative shrink-0 rounded-lg p-1.5" style={{ background: "linear-gradient(135deg, #0072ff, #7000ff)" }}>
          <BookOpen className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        {!collapsed && <span className="text-sm font-semibold tracking-tight text-white">Digital Logbook</span>}
        {!collapsed && <span className="ml-auto" />}
        {collapseButton}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-slate-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-slate-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Main navigation, in groups */}
      <nav className={`flex-1 overflow-y-auto pt-2 pb-3 ${collapsed ? "px-2" : "px-3"}`} aria-label="Main">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={groupIndex > 0 ? "mt-5" : undefined}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-2 mb-3 h-px bg-white/[0.06]" aria-hidden="true" />
            ) : (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                    `relative flex items-center ${collapsed ? "justify-center px-2" : "gap-2.5 pl-3 pr-2"} py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? "sidebar-nav-active"
                        : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                    }`
                  }
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {/* The edge, the wash, the text and a heavier icon together mark the current page. */}
                      {isActive && (
                        <span className="sidebar-active-bar absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full" aria-hidden="true" />
                      )}
                      <item.icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {item.to === "/reminders" && dueReminders > 0 && (
                        <span
                          className={`${
                            collapsed ? "absolute right-1 top-1 h-2 w-2 p-0" : "px-1.5 py-0.5 text-[10px]"
                          } rounded-full bg-amber-400/15 font-semibold leading-none text-amber-300 tabular-nums ring-1 ring-inset ring-amber-300/30`}
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

      {/* Who's signed in, and the way out */}
      <div className={`flex shrink-0 items-center gap-2.5 border-t border-white/[0.06] py-3 ${collapsed ? "flex-col px-2" : "px-4"}`}>
        <div className="shrink-0" aria-hidden="true">
          {avatar ? (
            <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #0072ff, #7000ff)" }}
            >
              {initial}
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-200">{displayName}</p>
            <p className="truncate text-[11px] text-slate-400">Student</p>
          </div>
        )}
        <button
          onClick={() => void logOut()}
          className="rounded-md p-1.5 text-slate-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-slate-100"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
