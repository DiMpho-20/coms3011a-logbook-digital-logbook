import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, Clock, CalendarDays, FileText, Loader2,
} from "lucide-react";

import {
  fetchProject,
  fetchProjectTimeSummary,
  fetchEntries,
  fetchEntryFields,
  type ProjectWithFields,
  type TimeSummary,
  type Entry,
  type EntryField,
  type EntryFieldValue,
} from "./api";

// ── helpers ──────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function isEmptyValue(v: EntryFieldValue): boolean {
  return v === "" || v === undefined || v === null;
}

// ── component ────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  onBack: () => void;
}

export default function ProjectDetail({ projectId, onBack }: Props) {
  const [project, setProject] = useState<ProjectWithFields | null>(null);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [proj, sum, ents, flds] = await Promise.all([
          fetchProject(projectId),
          fetchProjectTimeSummary(projectId),
          fetchEntries(projectId),
          fetchEntryFields(projectId),
        ]);
        if (cancelled) return;
        setProject(proj);
        setSummary(sum);
        setEntries(ents);
        setFields(flds);
      } catch (err) {
        console.error("Failed to load project detail:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-[#0084D4]" />
        <span className="ml-2 text-sm text-slate-500">Loading project...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Project not found.</p>
        <button onClick={onBack} className="mt-3 text-[#0084D4] text-xs font-bold hover:underline">
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-slate-200 transition text-slate-500"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-blue-900 tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-xs text-slate-500 mt-0.5">{project.description}</p>
          )}
        </div>
        <span
          className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold ${
            project.status === "ACTIVE"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-200 text-slate-600"
          }`}
        >
          {project.status}
        </span>
      </div>

      {/* Time summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-xl">
              <Clock className="h-4 w-4 text-[#0084D4]" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-800">{formatDuration(summary.totalMinutes)}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Time</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
            <div className="bg-emerald-50 p-2 rounded-xl">
              <FileText className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-800">{summary.entryCount}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Entries</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
            <div className="bg-orange-50 p-2 rounded-xl">
              <CalendarDays className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-800">
                {summary.lastEntryAt
                  ? new Date(summary.lastEntryAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Last Entry</p>
            </div>
          </div>
        </div>
      )}

      {/* Entry fields schema */}
      {project.entryFields.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
            Entry Schema
          </p>
          <div className="flex flex-wrap gap-2">
            {project.entryFields.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600"
              >
                <span className="font-bold">{f.name}</span>
                <span className="text-slate-400">({f.type.toLowerCase()})</span>
                {f.required && <span className="text-red-400">*</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Entries list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-black text-blue-900">Entries</h2>
        </div>
        <div className="p-4">
          {sortedEntries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              No entries logged for this project yet.
            </p>
          ) : (
            <div className="space-y-2">
              {sortedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {formatDuration(entry.durationMinutes)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(entry.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {fields.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {fields.map((field) => {
                        const value = entry.values?.[field.id];
                        if (isEmptyValue(value) && value !== false) return null;
                        return (
                          <span key={field.id} className="text-xs text-slate-600">
                            <span className="text-slate-400">{field.name}:</span>{" "}
                            <span className="font-medium text-slate-700">
                              {field.type === "BOOLEAN" ? (value ? "Yes" : "No") : String(value)}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {entry.dueDate && (
                    <p className="mt-1.5 text-[10px] text-amber-600 font-medium">
                      Due: {new Date(entry.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
