import { useState } from "react";
import { Database, Download, HardDrive, Trash2 } from "lucide-react";
import { applyTheme } from "../../lib/appearance";
import { DEFAULTS } from "./preferences";
import { Section } from "./parts";
import { formatBytes, localStorageBytes } from "./format";
import { downloadBackupJSON } from "./transfer";

const ON_SERVER = [
  "Your account, name and email address",
  "Profile details — bio, photo, degree, student number",
  "Projects, entries, custom fields and their history",
  "Tags, reminders and automation rules",
  "Your dashboard layout",
  "Two-factor secret and recovery code digests",
];

const IN_BROWSER = [
  "Theme, accent colour and density",
  "Logbook preferences — default project, view, sort",
  "Tag colours and saved filters",
  "Your sign-in token",
  "Anything captured while offline, until it syncs",
];

/** Where each thing actually lives, and how to take a copy of it. */
export default function DataSection() {
  // Measured once, when the section opens: the number is a curiosity, not a
  // live figure, and re-measuring on every render would say nothing new.
  const [localBytes] = useState(() => localStorageBytes());

  const handleClearData = () => {
    if (!confirm("Clear all local preferences? Your logbook entries on the server will not be affected.")) return;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("logbook-") && k !== "logbook-avatar") keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    applyTheme(DEFAULTS.theme);
  };

  return (
    <Section title="Data & privacy">
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
            {ON_SERVER.map((item) => (
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
            {IN_BROWSER.map((item) => (
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
        <button
          onClick={() => { downloadBackupJSON().catch(() => {}); }}
          className="shrink-0 flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
        >
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
  );
}
