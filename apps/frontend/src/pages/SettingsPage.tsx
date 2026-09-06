import { useState, useEffect, useRef } from "react";
import {
  User, Palette, Bell, BookOpen, Download, Upload, Trash2,
  Check, Sun, Moon, Monitor, Shield, ShieldCheck, X,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { exportLogbook, fetchProjects, importLogbook, type Project } from "../api";
import { api } from "../api/client";

// -- types --

type Theme = "light" | "dark" | "system";
type EntryView = "timeline" | "list";
type SortOrder = "newest" | "oldest";
type WeekStart = "monday" | "sunday";
type TimeFormat = "12h" | "24h";
type AccentColor = "blue" | "emerald" | "violet" | "amber" | "rose";

interface NotifSettings {
  dailyReminder: boolean;
  reminderTime: string;
  dueDateReminders: boolean;
}

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
  notif: { dailyReminder: false, reminderTime: "18:00", dueDateReminders: true } as NotifSettings,
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

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function applyAccent(color: AccentColor) {
  document.documentElement.setAttribute("data-accent", color);
}

// -- reusable small components --

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition shrink-0 ${
          checked ? "bg-blue-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </label>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
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

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

// -- main component --

export default function SettingsPage() {
  // Account
  const [name, setName] = useState(() => localStorage.getItem("logbook-name") || "Student");
  const [email, setEmail] = useState(() => localStorage.getItem("logbook-email") || "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [accountSaved, setAccountSaved] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Appearance
  const [theme, setTheme] = useState<Theme>(() => load("logbook-theme", DEFAULTS.theme));
  const [accent, setAccent] = useState<AccentColor>(() => load("logbook-accent", DEFAULTS.accent));

  // Notifications
  const [notif, setNotif] = useState<NotifSettings>(() => load("logbook-notif", DEFAULTS.notif));

  // Logbook
  const [logbook, setLogbook] = useState<LogbookPrefs>(() => load("logbook-prefs", DEFAULTS.logbook));
  const [projects, setProjects] = useState<Project[]>([]);

  // Data
  const importRef = useRef<HTMLInputElement>(null);
  const [dataMessage, setDataMessage] = useState("");
  const [importing, setImporting] = useState(false);

  // 2FA state
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState("");
  const [twoFAQrCode, setTwoFAQrCode] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFAError, setTwoFAError] = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState("");
  const [showDisable2FA, setShowDisable2FA] = useState(false);

  // Persist appearance on change
  useEffect(() => { save("logbook-theme", theme); applyTheme(theme); }, [theme]);
  useEffect(() => { save("logbook-accent", accent); applyAccent(accent); }, [accent]);
  useEffect(() => { save("logbook-notif", notif); }, [notif]);
  useEffect(() => { save("logbook-prefs", logbook); }, [logbook]);

  // Load projects for default project selector
  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  // Load 2FA status
  useEffect(() => {
    api.get("/auth/2fa/status").then((res) => setIs2FAEnabled(res.data.isTwoFactorEnabled)).catch(() => {});
  }, []);

  // -- handlers --

  const handleSaveAccount = () => {
    localStorage.setItem("logbook-name", name);
    localStorage.setItem("logbook-email", email);
    setAccountSaved(true);
    setTimeout(() => setAccountSaved(false), 2000);
    setCurrentPw("");
    setNewPw("");
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure you want to permanently delete your account? This cannot be undone.")) return;
    setDeleteError("");
    setIsDeleting(true);
    try {
      await api.delete("/auth/account", { data: { confirmPassword: deletePw } });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to delete account.";
      setDeleteError(msg);
      setIsDeleting(false);
      return;
    }
    // Clear all local data
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("logbook-")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem("token");
    applyTheme("system");
    window.location.href = "/";
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
      const rows: string[][] = [["Project ID", "Project Name", "Status", "Description"]];
      projs.forEach((p) => rows.push([p.id, p.name, p.status, p.description || ""]));
      const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
      downloadFile("logbook-projects.csv", csv, "text/csv");
    } catch {
      alert("CSV export failed. Check that the backend is running.");
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
    setNotif(DEFAULTS.notif);
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
      await api.post("/auth/2fa/verify-setup", { token: twoFACode });
      setIs2FAEnabled(true);
      setShow2FASetup(false);
      setTwoFACode("");
      setTwoFASecret("");
      setTwoFAQrCode("");
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
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to disable 2FA.";
      setTwoFAError(msg);
    } finally {
      setTwoFALoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage your account, appearance, and preferences." />

      {/* 1. Account */}
      <Section icon={User} title="Account">
        <Field label="Display name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Email address">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@university.ac.za" />
        </Field>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Change password</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="password" placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={inputCls} />
            <input type="password" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Password management will be available once authentication is connected.</p>
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

          {is2FAEnabled && !showDisable2FA && (
            <button
              onClick={() => setShowDisable2FA(true)}
              className="flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50 transition"
            >
              <Shield className="h-3.5 w-3.5" />
              Disable 2FA
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSaveAccount} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            {accountSaved && <Check className="h-3.5 w-3.5" />}
            {accountSaved ? "Saved" : "Save Changes"}
          </button>
        </div>
        <div className="border-t border-slate-100 pt-4 mt-2">
          <p className="text-sm font-medium text-red-700 mb-1">Delete account</p>
          <p className="text-xs text-slate-500 mb-3">Permanently remove your account and all associated data.</p>
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
              <Trash2 className="h-3.5 w-3.5" /> {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Section>

      {/* 2. Appearance */}
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
        </div>
      </Section>

      {/* 3. Notifications */}
      <Section icon={Bell} title="Notifications">
        <Toggle
          label="Daily logbook reminder"
          checked={notif.dailyReminder}
          onChange={(v) => setNotif({ ...notif, dailyReminder: v })}
        />
        {notif.dailyReminder && (
          <Field label="Reminder time">
            <input
              type="time"
              value={notif.reminderTime}
              onChange={(e) => setNotif({ ...notif, reminderTime: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 w-40"
            />
          </Field>
        )}
        <Toggle
          label="Due-date reminders"
          checked={notif.dueDateReminders}
          onChange={(v) => setNotif({ ...notif, dueDateReminders: v })}
        />
        <p className="text-[11px] text-slate-400">
          Browser notifications will be requested when this feature is activated.
        </p>
      </Section>

      {/* 4. Logbook Preferences */}
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

      {/* 5. Data */}
      <Section icon={Download} title="Data">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Export logbook</p>
            <p className="text-xs text-slate-500 mt-0.5">JSON includes projects, fields, and entries; CSV is a project summary.</p>
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
        <div className="border-t border-slate-100 pt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Clear local data</p>
            <p className="text-xs text-slate-500 mt-0.5">Remove saved preferences. Server data is not affected.</p>
          </div>
          <button onClick={handleClearData} className="shrink-0 flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition">
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </Section>

      {/* About */}
      <p className="text-xs text-slate-400 text-center pb-4">
        Digital Logbook - COMS3011A Software Design Project
      </p>
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
