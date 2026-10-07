import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { CloudOff, KeyRound, Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import HelpAssistant from "./HelpAssistant";
import EntryForm from "./EntryForm";
import Modal from "./Modal";
import { pendingEntryCount, SYNC_EVENT } from "../lib/offlineEntries";
import { pendingProjectCount, pendingProjectErrors } from "../lib/offlineProjects";
import { isQuickCaptureKey, lastProjectId } from "../lib/quickCapture";
import { fetchProjects, type Project } from "../api";

function describePending(projects: number, entries: number): string {
  const parts = [];
  if (projects > 0) parts.push(`${projects} project${projects === 1 ? "" : "s"}`);
  if (entries > 0) parts.push(`${entries} entr${entries === 1 ? "y" : "ies"}`);
  return parts.join(" and ") || "0 entries";
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // The quick-entry dialog: null while its project list is loading, [] when
  // the account has none, otherwise the projects the form can capture into.
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [quickEntryProjects, setQuickEntryProjects] = useState<Project[] | null>(null);

  // N anywhere opens the quick-entry form right here, preselected to the
  // project the student last worked in (issue #92). The project page keeps
  // its full form for editing, tags and recurrence; this one is for capture.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!isQuickCaptureKey(e)) return;
      e.preventDefault();
      setQuickEntryOpen(true);
      setQuickEntryProjects(null);
      try {
        setQuickEntryProjects(await fetchProjects());
      } catch {
        setQuickEntryProjects([]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // Left behind by a sign-in that spent a 2FA recovery code. Read on mount and
  // cleared in an effect rather than in the initializer, so StrictMode's double
  // invocation in development cannot swallow it.
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(() => {
    try {
      return localStorage.getItem("logbook-recovery-notice");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!recoveryNotice) return;
    try {
      localStorage.removeItem("logbook-recovery-notice");
    } catch {
      // Private browsing can refuse writes; the banner still shows this once.
    }
  }, [recoveryNotice]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("logbook-sidebar-collapsed") === "true",
  );
  const [pendingCount, setPendingCount] = useState(pendingEntryCount);
  const [pendingProjects, setPendingProjects] = useState(pendingProjectCount);
  const [syncErrors, setSyncErrors] = useState(pendingProjectErrors);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateStatus = () => {
      setOnline(navigator.onLine);
      setPendingCount(pendingEntryCount());
      setPendingProjects(pendingProjectCount());
      setSyncErrors(pendingProjectErrors());
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
      {/* Keyboard users land here first: jump straight past the navigation. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-blue-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>
      {/* Desktop sidebar */}
      {/* An inset panel: a little page shows around it, so it reads as part of the desk. */}
      <div className="hidden lg:flex p-3 pr-0">
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

        {recoveryNotice && (
          <div className="flex items-center gap-2 px-6 lg:px-8 py-2 text-xs font-medium border-b border-blue-200 bg-blue-50 text-blue-800">
            <KeyRound className="h-3.5 w-3.5 shrink-0" />
            <span>{recoveryNotice}</span>
            <button
              onClick={() => setRecoveryNotice(null)}
              className="ml-auto p-0.5 rounded hover:bg-blue-100 transition"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {(!online || pendingCount > 0 || pendingProjects > 0) && (
          <div className="flex items-center gap-2 px-6 lg:px-8 py-2 text-xs font-medium border-b border-amber-200 bg-amber-50 text-amber-800">
            <CloudOff className="h-3.5 w-3.5" />
            {!online
              ? pendingProjects === 0
                ? `Offline — ${pendingCount} entr${pendingCount === 1 ? "y is" : "ies are"} saved on this device and will sync when you reconnect.`
                : `Offline — ${describePending(pendingProjects, pendingCount)} saved on this device and will sync when you reconnect.`
              : syncErrors.length > 0
                ? `Couldn't sync "${syncErrors[0].name}": ${syncErrors[0].error} Edit the project to fix it and it will sync again.`
                : pendingProjects === 0
                  ? `Syncing ${pendingCount} saved offline entr${pendingCount === 1 ? "y" : "ies"}…`
                  : `Syncing ${describePending(pendingProjects, pendingCount)} saved offline…`}
          </div>
        )}

        {/* Page content */}
        <div id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-6 lg:p-8 outline-none">
          <Outlet />
        </div>
      </main>

      <HelpAssistant />

      {/* Quick capture: N from anywhere, every field type, no navigation. */}
      <Modal open={quickEntryOpen} onClose={() => setQuickEntryOpen(false)} title="Quick entry">
        {quickEntryProjects === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : quickEntryProjects.length === 0 ? (
          <p className="text-sm text-slate-500">
            No projects yet — create one on the Projects page, then press N to log work.
          </p>
        ) : (
          <EntryForm
            projects={quickEntryProjects}
            defaultProjectId={
              lastProjectId()
              // Nothing remembered: the first active project, as before.
              ?? quickEntryProjects.find((p) => p.status === "ACTIVE")?.id
            }
            submitLabel="Log entry"
            onSave={() => setQuickEntryOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}
