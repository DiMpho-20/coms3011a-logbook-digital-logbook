import { useState, useEffect, useRef, useMemo } from "react";
import {
  User, Palette, Bell, BookOpen, Download, Upload, Trash2,
  Check, Sun, Moon, Monitor, Shield, ShieldCheck, X,
  Lock, Database, Search, Rows3, AlignJustify, Mail, KeyRound,
  AlertTriangle, HardDrive, ChevronRight,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { exportLogbook, fetchDueReminders, fetchEntries, fetchEntryFields, fetchProjects, importLogbook, type Project } from "../api";
import { entriesToCsv } from "../lib/csvExport";
import {
  disableReminderNotifications,
  enableReminderNotifications,
  notificationsSupported,
  reminderNotificationMode,
} from "../lib/reminderNotifications";
import { api } from "../api/client";
import { applyAccent, applyDensity, applyTheme, type AccentColor, type Density, type Theme } from "../lib/appearance";

// -- types --

type EntryView = "timeline" | "list";
type SortOrder = "newest" | "oldest";
type WeekStart = "monday" | "sunday";
type TimeFormat = "12h" | "24h";

interface LogbookPrefs {
  defaultProjectId: string;
  defaultView: EntryView;
  defaultSort: SortOrder;
  weekStartsOn: WeekStart;
  timeFormat: TimeFormat;
}

const DEFAULTS = {
  theme: "system" as Theme,
  accent: "blue" as AccentColor,
  density: "comfortable" as Density,
  logbook: { defaultProjectId: "", defaultView: "timeline", defaultSort: "newest", weekStartsOn: "monday", timeFormat: "24h" } as LogbookPrefs,
};

// -- helpers --

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// -- reusable small components --

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

/** Turns system notifications for newly due reminders on or off on this device. */
/**
 * The settings sections, in nav order.
 *
 * `keywords` is what the search box matches on: the words someone would
 * actually type are rarely the words on the label — "dark" is in Appearance,
 * "2fa" is in Security — so each section carries its own vocabulary rather
 * than relying on the heading alone.
 */
const SECTIONS = [
  { id: "account", label: "Account", icon: User,
    keywords: "name display email address password reset delete close account" },
  { id: "appearance", label: "Appearance", icon: Palette,
    keywords: "theme dark light system colour color accent density compact comfortable spacing" },
  { id: "logbook", label: "Logbook", icon: BookOpen,
    keywords: "default project view timeline list sort order week starts monday sunday time format 12 24 hour" },
  { id: "notifications", label: "Notifications", icon: Bell,
    keywords: "reminders due overdue stalled daily browser desktop permission alerts" },
  { id: "security", label: "Security", icon: Lock,
    keywords: "two factor 2fa authenticator totp google recovery codes verification sign in" },
  { id: "privacy", label: "Data & Privacy", icon: Database,
    keywords: "storage local browser server what is stored privacy clear cached offline" },
  { id: "export", label: "Export / Import", icon: Download,
    keywords: "export import backup json download upload restore copy" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function SettingsNav({
  active, onSelect, matches,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  matches: readonly SectionId[] | null;
}) {
  return (
    <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible -mx-1 px-1 pb-1 lg:pb-0">
      {SECTIONS.map((section) => {
        // When a search is running, sections that cannot match are dimmed
        // rather than removed: a nav that changes length as you type is
        // harder to use than one that stays put.
        const dimmed = matches !== null && !matches.includes(section.id);
        const isActive = active === section.id;
        return (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap text-left shrink-0 lg:w-full ${
              isActive
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-50"
            } ${dimmed ? "opacity-40" : ""}`}
          >
            <section.icon className="h-4 w-4 shrink-0" />
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}

/** One row of the security checklist. */
function SecurityCheck({
  done, label, detail, action,
}: {
  done: boolean;
  label: string;
  detail: string;
  action?: { text: string; onClick: () => void };
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
          done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {done ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{detail}</p>
      </div>
      {action && !done && (
        <button
          onClick={action.onClick}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0 inline-flex items-center gap-0.5"
        >
          {action.text} <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}

/** Roughly how much of this browser's storage the logbook is using. */
function localStorageBytes(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("logbook-")) continue;
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch {
    return 0;
  }
  // UTF-16 in every engine that implements the spec, so two bytes a unit.
  return total * 2;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ReminderNotificationToggle() {
  const [mode, setMode] = useState(reminderNotificationMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const enabled = mode !== null;

  if (!notificationsSupported()) {
    return <p className="text-sm text-slate-500">This browser can't show notifications.</p>;
  }

  const toggle = async () => {
    setMessage("");
    setBusy(true);
    if (enabled) {
      await disableReminderNotifications();
      setMode(null);
      setBusy(false);
      return;
    }
    try {
      const on = await enableReminderNotifications(await fetchDueReminders());
      setMode(reminderNotificationMode());
      if (!on) {
        setMessage(
          Notification.permission === "denied"
            ? "Notifications are blocked for this site. Allow them in your browser's site settings, then try again."
            : "Notifications weren't allowed."
        );
      }
    } catch {
      setMessage("Couldn't turn on notifications. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={toggle}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span>
          <span className="block text-sm font-medium text-slate-700">Notify me on this device</span>
          <span className="block text-sm text-slate-500">
            {mode === "in-app"
              ? "Shows a system notification when a reminder falls due, while the logbook is open in a tab. This browser can't receive notifications with the app closed."
              : "Shows a system notification when a reminder falls due, even when the logbook is closed."}
          </span>
        </span>
      </label>
      {message && <p className="text-sm text-amber-700">{message}</p>}
    </div>
  );
}

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

// -- main component --

export default function SettingsPage() {
  // Account
  const [name, setName] = useState(() => localStorage.getItem("logbook-name") || "Student");
  const [email, setEmail] = useState(() => localStorage.getItem("logbook-email") || "");
  const [accountSaved, setAccountSaved] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Appearance
  const [theme, setTheme] = useState<Theme>(() => load("logbook-theme", DEFAULTS.theme));
  const [accent, setAccent] = useState<AccentColor>(() => load("logbook-accent", DEFAULTS.accent));
  const [density, setDensity] = useState<Density>(() => load("logbook-density", DEFAULTS.density));

  // Which panel is open, kept in the URL so a section can be linked to and
  // survives a reload — ?section=security rather than component state alone.
  const [searchParams, setSearchParams] = useSearchParams();
  const active = (searchParams.get("section") ?? "account") as SectionId;
  const setActive = (id: SectionId) => setSearchParams(id === "account" ? {} : { section: id });
  const [query, setQuery] = useState("");

  // Account
  const [accountError, setAccountError] = useState("");
  const [resetSent, setResetSent] = useState(false);


  // Logbook
  const [logbook, setLogbook] = useState<LogbookPrefs>(() => load("logbook-prefs", DEFAULTS.logbook));
  const [projects, setProjects] = useState<Project[]>([]);

  // Data
  const importRef = useRef<HTMLInputElement>(null);
  const [dataMessage, setDataMessage] = useState("");
  const [importing, setImporting] = useState(false);

  // 2FA state
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState("");
  const [twoFAQrCode, setTwoFAQrCode] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFAError, setTwoFAError] = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState("");
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  // Shown exactly once, straight after they are generated. The server keeps
  // only digests, so if the user navigates away without saving these they
  // are gone for good and a fresh set has to be issued.
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryCodesRemaining, setRecoveryCodesRemaining] = useState(0);
  const [showRegenerateCodes, setShowRegenerateCodes] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState("");
  const [codesCopied, setCodesCopied] = useState(false);

  // Persist appearance on change
  useEffect(() => { save("logbook-theme", theme); applyTheme(theme); }, [theme]);
  useEffect(() => { save("logbook-accent", accent); applyAccent(accent); }, [accent]);
  useEffect(() => { save("logbook-density", density); applyDensity(density); }, [density]);
  useEffect(() => { save("logbook-prefs", logbook); }, [logbook]);

  // Load projects for default project selector
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  // Load 2FA status
  useEffect(() => {
    api
      .get("/auth/2fa/status")
      .then((res) => {
        setIs2FAEnabled(res.data.isTwoFactorEnabled);
        setRecoveryCodesRemaining(res.data.recoveryCodesRemaining ?? 0);
      })
      .catch(() => {});

    // The security checklist needs to know whether the address has been
    // confirmed; /me is the only place that says so.
    api
      .get("/me")
      .then((res) => setEmailVerified(Boolean(res.data.isEmailVerified)))
      .catch(() => setEmailVerified(null));
  }, []);

  // -- handlers --

  /**
   * Save the display name to the account.
   *
   * This used to write the name and the email to localStorage and report
   * "Saved". The name only changed in that one browser, and the email did not
   * change the account's address at all — which was the more serious half,
   * because a student could type a new address, be told it saved, and still
   * have password resets go to the old one. The name is now written to the
   * server and the email is read-only.
   */
  const handleSaveAccount = async () => {
    setAccountError("");
    const trimmed = name.trim();
    if (!trimmed) {
      setAccountError("Display name cannot be empty.");
      return;
    }
    try {
      const { data } = await api.patch("/me", { fullName: trimmed });
      setName(data.fullName);
      // The sidebar still reads the name from here; the server is the source
      // of truth and this keeps that copy from going stale.
      localStorage.setItem("logbook-name", data.fullName);
      setAccountSaved(true);
      setTimeout(() => setAccountSaved(false), 2000);
    } catch (error: any) {
      setAccountError(error?.response?.data?.error ?? "Your name could not be saved.");
    }
  };

  /**
   * Change the password by the route that actually exists.
   *
   * There is no authenticated change-password endpoint, so rather than keep a
   * form that silently discarded what was typed into it, this sends the same
   * reset email the login page does. It works today and it proves the student
   * controls the address, which a straight change would not.
   */
  const handleSendReset = async () => {
    setAccountError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setResetSent(true);
    } catch {
      setAccountError("The reset email could not be sent. Try again in a moment.");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setIsDeleting(true);
    try {
      const res = await api.delete("/auth/account", { data: { confirmPassword: deletePw } });

      // Clear local data and redirect to login with the scheduled date.
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("logbook-")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem("token");
      applyTheme("system");

      const date = encodeURIComponent(res.data.scheduledDeletionAt);
      window.location.href = `/login?deletionScheduled=${date}`;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to delete account.";
      setDeleteError(msg);
      setIsDeleting(false);
    }
  };

  const handleExportJSON = async () => {
    try {
      const backup = await exportLogbook();
      downloadFile("digital-logbook-backup.json", JSON.stringify(backup, null, 2), "application/json");
      setDataMessage(`Exported ${backup.projects.length} project${backup.projects.length === 1 ? "" : "s"}.`);
    } catch {
      setDataMessage("Export failed. Check your connection and try again.");
    }
  };

  const handleExportCSV = async () => {
    try {
      const projs = await fetchProjects();
      const data = await Promise.all(projs.map(async (project) => {
        const [fields, entries] = await Promise.all([
          fetchEntryFields(project.id),
          fetchEntries(project.id, { archived: "include" }),
        ]);
        return { project, fields, entries };
      }));
      // The byte-order mark makes Excel read the file as UTF-8.
      downloadFile("logbook-entries.csv", "﻿" + entriesToCsv(data), "text/csv");
      const count = data.reduce((n, d) => n + d.entries.length, 0);
      setDataMessage(`Exported ${count} entr${count === 1 ? "y" : "ies"} as CSV.`);
    } catch {
      setDataMessage("CSV export failed. Check your connection and try again.");
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setImporting(true);
        let preferences = 0;
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith("logbook-") && key !== "logbook-avatar") {
            localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
            preferences++;
          }
        }
        const result = await importLogbook(data);
        setDataMessage(`Imported ${result.projects} project${result.projects === 1 ? "" : "s"} and ${result.entries} entr${result.entries === 1 ? "y" : "ies"}${preferences ? `, plus ${preferences} preference${preferences === 1 ? "" : "s"}` : ""}.`);
        fetchProjects().then(setProjects).catch(() => {});
      } catch (error) {
        setDataMessage(error instanceof Error ? error.message : "The selected file could not be imported.");
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearData = () => {
    if (!confirm("Clear all local preferences? Your logbook entries on the server will not be affected.")) return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("logbook-") && k !== "logbook-avatar") keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    applyTheme("system");
    setName("Student");
    setEmail("");
    setTheme("system");
    setAccent("blue");
    setLogbook(DEFAULTS.logbook);
  };

  // -- 2FA handlers --

  const handleStart2FASetup = async () => {
    setTwoFAError("");
    setTwoFALoading(true);
    try {
      const res = await api.post("/auth/2fa/setup");
      setTwoFASecret(res.data.secret);
      setTwoFAQrCode(res.data.qrCodeUrl);
      setShow2FASetup(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to start 2FA setup.";
      setTwoFAError(msg);
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleVerify2FASetup = async () => {
    setTwoFAError("");
    if (!/^\d{6}$/.test(twoFACode)) {
      setTwoFAError("Please enter a valid 6-digit code");
      return;
    }
    setTwoFALoading(true);
    try {
      const res = await api.post("/auth/2fa/verify-setup", { token: twoFACode });
      setIs2FAEnabled(true);
      setShow2FASetup(false);
      setTwoFACode("");
      setTwoFASecret("");
      setTwoFAQrCode("");
      setRecoveryCodes(res.data.recoveryCodes ?? []);
      setRecoveryCodesRemaining((res.data.recoveryCodes ?? []).length);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Invalid code.";
      setTwoFAError(msg);
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setTwoFAError("");
    if (!disable2FAPassword) {
      setTwoFAError("Password is required");
      return;
    }
    setTwoFALoading(true);
    try {
      await api.post("/auth/2fa/disable", { password: disable2FAPassword });
      setIs2FAEnabled(false);
      setShowDisable2FA(false);
      setDisable2FAPassword("");
      setRecoveryCodes([]);
      setRecoveryCodesRemaining(0);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to disable 2FA.";
      setTwoFAError(msg);
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleRegenerateCodes = async () => {
    setTwoFAError("");
    if (!regeneratePassword) {
      setTwoFAError("Password is required");
      return;
    }
    setTwoFALoading(true);
    try {
      const res = await api.post("/auth/2fa/recovery-codes", { password: regeneratePassword });
      setRecoveryCodes(res.data.recoveryCodes ?? []);
      setRecoveryCodesRemaining((res.data.recoveryCodes ?? []).length);
      setShowRegenerateCodes(false);
      setRegeneratePassword("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to generate new recovery codes.";
      setTwoFAError(msg);
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleCopyCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCodesCopied(true);
      setTimeout(() => setCodesCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the codes are on screen regardless.
      setTwoFAError("Could not copy automatically — please select and copy the codes manually.");
    }
  };

  const handleDownloadCodes = () => {
    const body = [
      "Digital Logbook — two-factor recovery codes",
      `Generated ${new Date().toLocaleString()}`,
      "",
      "Each code works once. Keep them somewhere you can reach without your phone.",
      "",
      ...recoveryCodes,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "logbook-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const localBytes = useMemo(() => localStorageBytes(), [active]);

  const trimmedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!trimmedQuery) return null;
    return SECTIONS.filter(
      (section) =>
        section.label.toLowerCase().includes(trimmedQuery) ||
        section.keywords.includes(trimmedQuery)
    ).map((section) => section.id);
  }, [trimmedQuery]);

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader title="Settings" subtitle="Manage your account, appearance, and preferences." />

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings…"
          aria-label="Search settings"
          className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
        />
      </div>

      {matches !== null && (
        <p className="text-xs text-slate-500" role="status">
          {matches.length === 0
            ? "Nothing matches that. Try \u201cdark\u201d, \u201c2fa\u201d or \u201cexport\u201d."
            : `In ${matches.length} section${matches.length === 1 ? "" : "s"}: ${matches
                .map((id) => SECTIONS.find((section) => section.id === id)!.label)
                .join(", ")}`}
        </p>
      )}

      <div className="grid lg:grid-cols-[200px_1fr] gap-5 items-start">
        <SettingsNav active={active} onSelect={setActive} matches={matches} />

        <div className="space-y-5 min-w-0">

      {active === "account" && (
      <Section icon={User} title="Account">
        <Field label="Display name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={255} />
        </Field>
        <div>
          <p className="text-sm text-slate-600 mb-1.5">Email address</p>
          <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 rounded-lg px-3 py-2">
            <Mail className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-sm text-slate-600 truncate">{email || "No email on file"}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            This is the address you sign in with and where a password reset is sent, so it
            cannot be changed from here.
          </p>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700 mb-1">Password</p>
          <p className="text-xs text-slate-500 mb-3">
            Changing it is done through an emailed link, the same way the login page does it.
          </p>
          {resetSent ? (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 shrink-0" />
              If that address has an account, a reset link is on its way.
            </p>
          ) : (
            <button
              onClick={handleSendReset}
              disabled={!email}
              className="inline-flex items-center gap-1.5 border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              <KeyRound className="h-3.5 w-3.5" /> Email me a reset link
            </button>
          )}
        </div>
        {accountError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{accountError}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSaveAccount} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            {accountSaved && <Check className="h-3.5 w-3.5" />}
            {accountSaved ? "Saved" : "Save Changes"}
          </button>
        </div>
        <div className="border-t border-slate-100 pt-4 mt-2">
          <p className="text-sm font-medium text-red-700 mb-1">Delete account</p>
          <p className="text-xs text-slate-500 mb-3">
            Schedule your account and all associated data for permanent deletion in 30 days. You can cancel by logging in before then.
          </p>
          {deleteError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-2">{deleteError}</p>
          )}
          <div className="flex items-end gap-2">
            <input
              type="password"
              placeholder="Confirm your password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-400 flex-1 max-w-xs"
            />
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting || !deletePw}
              className="shrink-0 flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" /> {isDeleting ? "Scheduling..." : "Delete"}
            </button>
          </div>
        </div>
      </Section>
      )}

      {active === "security" && (
      <Section icon={Lock} title="Security">
        {/* The checklist is deliberately a list of specific things rather than
            a score out of ten: "2 of 3" tells you what to do next, a number
            out of a hundred only tells you how to feel. */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-1">
          <ul className="divide-y divide-slate-200/70">
            <SecurityCheck
              done={is2FAEnabled}
              label="Two-factor authentication"
              detail={
                is2FAEnabled
                  ? "A code from your authenticator app is required at sign-in."
                  : "Your password alone is enough to sign in right now."
              }
              // Must go through the same handler as "Enable 2FA": opening the
              // panel alone shows no secret, and the server has none to verify.
              action={{ text: "Set up", onClick: handleStart2FASetup }}
            />
            {is2FAEnabled && (
              <SecurityCheck
                done={recoveryCodesRemaining > 0}
                label="Recovery codes"
                detail={
                  recoveryCodesRemaining > 0
                    ? `${recoveryCodesRemaining} left — these are how you get in without your phone.`
                    : "None left. Without one, losing your phone locks you out."
                }
              />
            )}
            <SecurityCheck
              done={emailVerified === true}
              label="Email address confirmed"
              detail={
                emailVerified === null
                  ? "Could not be checked just now."
                  : emailVerified
                    ? "Password resets will reach you."
                    : "Unconfirmed, so a password reset may not reach you."
              }
            />
          </ul>
        </div>

        {/* Two-Factor Authentication */}
        <div className="border-t border-slate-100 pt-4 mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {is2FAEnabled ? (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              ) : (
                <Shield className="h-4 w-4 text-slate-500" />
              )}
              <p className="text-sm font-medium text-slate-700">Two-factor authentication</p>
            </div>
            {is2FAEnabled && (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                Enabled
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Add an extra layer of security to your account using Google Authenticator or any TOTP app.
          </p>

          {twoFAError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{twoFAError}</p>
          )}

          {/* Recovery codes — shown once, at the moment they are generated */}
          {recoveryCodes.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-3">
              <h3 className="text-sm font-semibold text-amber-900 mb-1">
                Save your recovery codes
              </h3>
              <p className="text-xs text-amber-800 mb-3">
                Each code works once, and lets you sign in if you lose your
                authenticator device. This is the only time they will be shown —
                store them somewhere you can reach without your phone.
              </p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm text-slate-800 bg-white border border-amber-200 rounded-md p-3 mb-3">
                {recoveryCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCodes}
                  className="border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition"
                >
                  {codesCopied ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={handleDownloadCodes}
                  className="border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition"
                >
                  Download
                </button>
                <button
                  onClick={() => setRecoveryCodes([])}
                  className="ml-auto bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                >
                  I have saved them
                </button>
              </div>
            </div>
          )}

          {/* 2FA Setup Modal */}
          {show2FASetup && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">Set up authenticator</h3>
                <button
                  onClick={() => { setShow2FASetup(false); setTwoFACode(""); setTwoFAError(""); }}
                  className="p-1 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col items-center gap-3">
                {twoFAQrCode && (
                  <img src={twoFAQrCode} alt="QR Code" className="w-40 h-40 rounded-lg border border-slate-200" />
                )}
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-1">Or enter this secret manually:</p>
                  <code className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 select-all font-mono">
                    {twoFASecret}
                  </code>
                </div>
                <div className="w-full max-w-xs">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ""))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 tracking-widest"
                  />
                </div>
                <button
                  onClick={handleVerify2FASetup}
                  disabled={twoFALoading || !twoFACode}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {twoFALoading ? "Verifying..." : "Verify & Enable"}
                </button>
              </div>
            </div>
          )}

          {/* Disable 2FA Modal */}
          {showDisable2FA && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">Disable two-factor authentication</h3>
                <button
                  onClick={() => { setShowDisable2FA(false); setDisable2FAPassword(""); setTwoFAError(""); }}
                  className="p-1 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">Enter your password to confirm disabling 2FA.</p>
              <div className="flex items-end gap-2">
                <input
                  type="password"
                  placeholder="Your password"
                  value={disable2FAPassword}
                  onChange={(e) => setDisable2FAPassword(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-red-400 flex-1"
                />
                <button
                  onClick={handleDisable2FA}
                  disabled={twoFALoading || !disable2FAPassword}
                  className="shrink-0 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50 transition disabled:opacity-50"
                >
                  {twoFALoading ? "Disabling..." : "Disable 2FA"}
                </button>
              </div>
            </div>
          )}

          {!is2FAEnabled && !show2FASetup && (
            <button
              onClick={handleStart2FASetup}
              disabled={twoFALoading}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <Shield className="h-3.5 w-3.5" />
              {twoFALoading ? "Starting..." : "Enable 2FA"}
            </button>
          )}

          {is2FAEnabled && showRegenerateCodes && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">
                Generate new recovery codes
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Your existing codes will stop working immediately.
              </p>
              <input
                type="password"
                value={regeneratePassword}
                onChange={(e) => setRegeneratePassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRegenerateCodes}
                  disabled={twoFALoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition disabled:opacity-50"
                >
                  {twoFALoading ? "Generating..." : "Generate new codes"}
                </button>
                <button
                  onClick={() => {
                    setShowRegenerateCodes(false);
                    setRegeneratePassword("");
                    setTwoFAError("");
                  }}
                  className="border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {is2FAEnabled && !showDisable2FA && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowDisable2FA(true)}
                className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50 transition"
              >
                <Shield className="h-3.5 w-3.5" />
                Disable 2FA
              </button>
              {!showRegenerateCodes && (
                <button
                  onClick={() => setShowRegenerateCodes(true)}
                  className="border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-100 transition"
                >
                  Regenerate recovery codes
                </button>
              )}
              <span
                className={`text-xs ${
                  recoveryCodesRemaining === 0 ? "text-red-600" : "text-slate-500"
                }`}
              >
                {recoveryCodesRemaining === 0
                  ? "No recovery codes left"
                  : `${recoveryCodesRemaining} recovery code${
                      recoveryCodesRemaining === 1 ? "" : "s"
                    } remaining`}
              </span>
            </div>
          )}
        </div>

      </Section>
      )}

      {active === "appearance" && (
      <Section icon={Palette} title="Appearance">
        <div>
          <p className="text-sm text-slate-600 mb-3">Theme</p>
          <div className="flex gap-3">
            {([
              { value: "light" as const, icon: Sun, label: "Light" },
              { value: "dark" as const, icon: Moon, label: "Dark" },
              { value: "system" as const, icon: Monitor, label: "System" },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition min-w-[90px] ${
                  theme === value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600 mb-3">Accent colour</p>
          <div className="flex gap-2">
            {([
              { value: "blue" as const, bg: "bg-blue-500" },
              { value: "emerald" as const, bg: "bg-emerald-500" },
              { value: "violet" as const, bg: "bg-violet-500" },
              { value: "amber" as const, bg: "bg-amber-500" },
              { value: "rose" as const, bg: "bg-rose-500" },
            ]).map(({ value, bg }) => (
              <button
                key={value}
                onClick={() => setAccent(value)}
                className={`h-8 w-8 rounded-full ${bg} transition ${
                  accent === value ? "ring-2 ring-offset-2 ring-blue-500" : "ring-1 ring-slate-200"
                }`}
                aria-label={value}
              />
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Recolours buttons, links and highlights across the app.
          </p>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600 mb-3">Density</p>
          <div className="flex gap-3">
            {([
              { value: "comfortable" as const, icon: AlignJustify, label: "Comfortable", hint: "Default spacing" },
              { value: "compact" as const, icon: Rows3, label: "Compact", hint: "More on screen" },
            ]).map(({ value, icon: Icon, label, hint }) => (
              <button
                key={value}
                onClick={() => setDensity(value)}
                className={`flex items-start gap-2.5 p-3 rounded-lg border-2 transition text-left flex-1 max-w-[220px] ${
                  density === value ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${density === value ? "text-blue-700" : "text-slate-500"}`} />
                <span>
                  <span className={`block text-xs font-medium ${density === value ? "text-blue-700" : "text-slate-700"}`}>{label}</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Tightens padding only — text stays the same size.
          </p>
        </div>
      </Section>
      )}

      {/* 3. Notifications — the rules live on the server, with the reminders themselves */}
      {active === "notifications" && (
      <Section icon={Bell} title="Notifications">
        <p className="text-sm text-slate-600">
          Due-date, overdue, stalled-entry and daily logbook reminders are configured with your reminders.
        </p>
        <Link
          to="/reminders"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          Manage reminder rules
        </Link>
        <ReminderNotificationToggle />
      </Section>
      )}

      {/* 4. Logbook Preferences */}
      {active === "logbook" && (
      <Section icon={BookOpen} title="Logbook Preferences">
        <Field label="Default project for new entries">
          <select
            value={logbook.defaultProjectId}
            onChange={(e) => setLogbook({ ...logbook, defaultProjectId: e.target.value })}
            className={inputCls}
          >
            <option value="">None - always ask</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Default entry view">
            <select
              value={logbook.defaultView}
              onChange={(e) => setLogbook({ ...logbook, defaultView: e.target.value as EntryView })}
              className={inputCls}
            >
              <option value="timeline">Timeline</option>
              <option value="list">List</option>
            </select>
          </Field>
          <Field label="Sort order">
            <select
              value={logbook.defaultSort}
              onChange={(e) => setLogbook({ ...logbook, defaultSort: e.target.value as SortOrder })}
              className={inputCls}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </Field>
          <Field label="Week starts on">
            <select
              value={logbook.weekStartsOn}
              onChange={(e) => setLogbook({ ...logbook, weekStartsOn: e.target.value as WeekStart })}
              className={inputCls}
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </Field>
          <Field label="Time format">
            <select
              value={logbook.timeFormat}
              onChange={(e) => setLogbook({ ...logbook, timeFormat: e.target.value as TimeFormat })}
              className={inputCls}
            >
              <option value="24h">24-hour</option>
              <option value="12h">12-hour</option>
            </select>
          </Field>
        </div>
      </Section>
      )}

      {/* 5. Export / Import */}
      {active === "export" && (
      <Section icon={Download} title="Export / Import">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Export logbook</p>
            <p className="text-xs text-slate-500 mt-0.5">JSON is a full backup you can import again; CSV is every entry as a spreadsheet.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={handleExportJSON} className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition">
              <Download className="h-3.5 w-3.5" /> JSON
            </button>
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Import / restore backup</p>
            <p className="text-xs text-slate-500 mt-0.5">Restore projects, custom fields, and entries from a Digital Logbook JSON backup.</p>
          </div>
          <button disabled={importing} onClick={() => importRef.current?.click()} className="shrink-0 flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" /> {importing ? "Importing..." : "Import"}
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
        </div>
        {dataMessage && <p className="text-xs text-slate-600 bg-slate-50 rounded-md px-3 py-2">{dataMessage}</p>}
      </Section>
      )}

      {/* 6. Data & Privacy — where each thing actually lives */}
      {active === "privacy" && (
      <Section icon={Database} title="Data & Privacy">
        <p className="text-sm text-slate-600">
          Your logbook is split between two places, and the difference matters: one
          follows you to any device you sign in on, the other does not.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="border border-slate-200 rounded-lg p-3.5">
            <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-slate-400" /> On the server
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-2">Follows you between browsers and devices.</p>
            <ul className="text-xs text-slate-600 space-y-1">
              {[
                "Your account, name and email address",
                "Profile details — bio, photo, degree, student number",
                "Projects, entries, custom fields and their history",
                "Tags, reminders and automation rules",
                "Your dashboard layout",
                "Two-factor secret and recovery code digests",
              ].map((item) => (
                <li key={item} className="flex gap-1.5">
                  <span className="text-slate-300 shrink-0">•</span> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-slate-200 rounded-lg p-3.5">
            <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-slate-400" /> In this browser only
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 mb-2">
              Lost if you clear site data, and not shared with your other devices.
            </p>
            <ul className="text-xs text-slate-600 space-y-1">
              {[
                "Theme, accent colour and density",
                "Logbook preferences — default project, view, sort",
                "Tag colours and saved filters",
                "Your sign-in token",
                "Anything captured while offline, until it syncs",
              ].map((item) => (
                <li key={item} className="flex gap-1.5">
                  <span className="text-slate-300 shrink-0">•</span> {item}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-500 mt-2.5 pt-2.5 border-t border-slate-100">
              Using about <span className="font-medium text-slate-700">{formatBytes(localBytes)}</span> here.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Take a copy of everything</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Your projects, fields and entries as a JSON file you keep.
            </p>
          </div>
          <button onClick={handleExportJSON} className="shrink-0 flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition">
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        </div>

        <div className="border-t border-slate-100 pt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Clear local data</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Removes the browser-only column above. Nothing on the server is touched,
              and signing in again restores your logbook.
            </p>
          </div>
          <button onClick={handleClearData} className="shrink-0 flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition">
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </Section>
      )}

      <p className="text-xs text-slate-400 pt-2">
        Digital Logbook — COMS3011A Software Design Project
      </p>

        </div>
      </div>
    </div>
  );
}

// -- util --

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
