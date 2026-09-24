import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { CloudOff, Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import { pendingEntryCount, SYNC_EVENT } from "../lib/offlineEntries";

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("logbook-sidebar-collapsed") === "true",
  );
  const [pendingCount, setPendingCount] = useState(pendingEntryCount);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateStatus = () => {
      setOnline(navigator.onLine);
      setPendingCount(pendingEntryCount());
    };
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    window.addEventListener(SYNC_EVENT, updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
      window.removeEventListener(SYNC_EVENT, updateStatus);
    };
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      localStorage.setItem("logbook-sidebar-collapsed", String(nextCollapsed));
      return nextCollapsed;
    });
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="h-full w-60"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-900">Digital Logbook</span>
        </div>

        {(!online || pendingCount > 0) && (
          <div className="flex items-center gap-2 px-6 lg:px-8 py-2 text-xs font-medium border-b border-amber-200 bg-amber-50 text-amber-800">
            <CloudOff className="h-3.5 w-3.5" />
            {!online
              ? `Offline — ${pendingCount} entr${pendingCount === 1 ? "y is" : "ies are"} saved on this device and will sync when you reconnect.`
              : `Syncing ${pendingCount} saved offline entr${pendingCount === 1 ? "y" : "ies"}…`}
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
