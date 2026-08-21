import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  FileText,
  CalendarDays,
  Plus,
  Archive,
  ArchiveRestore,
} from "lucide-react";

import {
  fetchProject,
  fetchProjectTimeSummary,
  fetchEntries,
  fetchEntryFields,
  toggleProjectStatus,
  type ProjectWithFields,
  type TimeSummary,
  type Entry,
  type EntryField,
} from "../api";
import { formatDuration } from "../lib/utils";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import EntryCard from "../components/EntryCard";
import EntryForm from "../components/EntryForm";
import Modal from "../components/Modal";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectWithFields | null>(null);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fields, setFields] = useState<EntryField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entryModalOpen, setEntryModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [proj, sum, ents, flds] = await Promise.all([
        fetchProject(id),
        fetchProjectTimeSummary(id),
        fetchEntries(id),
        fetchEntryFields(id),
      ]);
      setProject(proj);
      setSummary(sum);
      setEntries(ents);
      setFields(flds);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load project.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries]
  );

  const handleToggleArchive = async () => {
    if (!project) return;
    const newStatus = project.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    try {
      await toggleProjectStatus(project.id, newStatus);
      const updated = await fetchProject(project.id);
      setProject(updated);
    } catch (err) {
      console.error("Failed to update project status:", err);
    }
  };

  const handleEntrySaved = (entry: unknown) => {
    setEntries((prev) => [entry as Entry, ...prev]);
    setEntryModalOpen(false);
    // Refresh summary in background
    if (id) {
      fetchProjectTimeSummary(id).then(setSummary).catch(() => {});
    }
  };

  // Build project list for EntryForm (just this one project)
  const projectList = useMemo(
    () => (project ? [{ id: project.id, name: project.name, status: project.status, description: project.description, createdAt: project.createdAt, updatedAt: project.updatedAt, userId: project.userId }] : []),
    [project]
  );

  if (loading) return <LoadingState message="Loading project..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-500">Project not found.</p>
        <Link to="/projects" className="text-xs text-blue-600 font-medium hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link to="/projects" className="hover:text-blue-600 transition font-medium">
          Projects
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">{project.name}</span>
      </nav>

      {/* Project header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate("/projects")}
            className="p-1.5 rounded-md hover:bg-slate-200 transition text-slate-500 mt-0.5"
            aria-label="Back to projects"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            {project.description && (
              <p className="text-sm text-slate-500 mt-1">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleArchive}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              project.status === "ACTIVE"
                ? "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-amber-600"
                : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
            }`}
          >
            {project.status === "ACTIVE" ? (
              <>
                <Archive className="h-3.5 w-3.5" /> Archive
              </>
            ) : (
              <>
                <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
              </>
            )}
          </button>
          <button
            onClick={() => setEntryModalOpen(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
          >
            <Plus className="h-4 w-4" /> Add Entry
          </button>
        </div>
      </div>

      {/* Time summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={Clock} label="Total Time" value={formatDuration(summary.totalMinutes)} color="blue" />
          <StatCard icon={FileText} label="Entries" value={summary.entryCount} color="emerald" />
          <StatCard
            icon={CalendarDays}
            label="Last Entry"
            value={
              summary.lastEntryAt
                ? new Date(summary.lastEntryAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "—"
            }
            color="orange"
          />
        </div>
      )}

      {/* Entry schema */}
      {fields.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">
            Entry Schema
          </h3>
          <div className="flex flex-wrap gap-2">
            {fields.map((f) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600"
              >
                <span className="font-medium">{f.name}</span>
                <span className="text-slate-400">({f.type.toLowerCase()})</span>
                {f.required && <span className="text-red-400">*</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Entries list */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Entries</h2>
          <span className="text-xs text-slate-400">{entries.length} total</span>
        </div>
        <div className="p-4">
          {sortedEntries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-400 mb-3">No entries logged for this project yet.</p>
              <button
                onClick={() => setEntryModalOpen(true)}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                <Plus className="h-4 w-4" /> Add First Entry
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} fields={fields} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Entry Modal */}
      <Modal
        open={entryModalOpen}
        onClose={() => setEntryModalOpen(false)}
        title={`Add Entry — ${project.name}`}
      >
        <EntryForm
          projects={projectList}
          projectId={project.id}
          fields={fields}
          onSave={handleEntrySaved}
          submitLabel="Add Entry"
          compact
        />
      </Modal>
    </div>
  );
}
