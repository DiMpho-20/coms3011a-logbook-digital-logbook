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
} from "lucide-react";

interface SidebarProps {
  onClose?: () => void;
}

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban, end: false },
  { to: "/entries", label: "Entries", icon: ClipboardList, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
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
    <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col h-full shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800 shrink-0">
        <div className="p-1.5 bg-blue-600 rounded-lg">
          <BookOpen className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-tight">
          Digital Logbook
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                isActive
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User area */}
      <div ref={menuRef} className="relative border-t border-slate-800 shrink-0">
        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-30">
            <button
              onClick={() => handleNav("/profile")}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left"
            >
              <UserIcon className="h-4 w-4 text-slate-500" /> Profile
            </button>
            <button
              onClick={() => handleNav("/settings")}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left"
            >
              <Settings className="h-4 w-4 text-slate-500" /> Settings
            </button>
            <div className="border-t border-slate-100" />
            <button
              onClick={() => {
                setMenuOpen(false);
                localStorage.removeItem("token");
                window.location.href = "/login";
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition text-left"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-800/60 transition text-left"
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
              {initial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">{displayName}</p>
            <p className="text-[10px] text-slate-500 truncate">Digital Logbook</p>
          </div>
          <ChevronUp
            className={`h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform ${
              menuOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    </aside>
  );
}
