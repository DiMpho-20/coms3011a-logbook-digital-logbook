import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clock, FileText, CalendarDays, Check, Circle } from "lucide-react";

import { fetchEntryFormatVersions, type Entry } from "../api";
import { formatDuration } from "../lib/utils";
import { rememberProject } from "../lib/quickCapture";
import { SYNC_EVENT } from "../lib/offlineEntries";
import { resolveSyncedId } from "../lib/offlineProjects";
import StatCard from "../components/StatCard";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import EntryHistoryModal from "../components/EntryHistoryModal";
import DeleteProjectModal from "../components/DeleteProjectModal";
import AutomationRules from "../components/AutomationRules";
import { useProjectEntries } from "./project/useProjectEntries";
import { useEntryForm } from "./project/useEntryForm";
import { relativeDay } from "./project/format";
import ProjectHeader from "./project/ProjectHeader";
import ProjectEntriesSection from "./project/ProjectEntriesSection";
import EntryFormModal from "./project/EntryFormModal";
import FormatHistoryModal, { type FormatVersion } from "./project/FormatHistoryModal";

/**
 * One project: what it is, how much time is in it, what it asks of an entry
 * and everything logged against it.
 *
 * `useProjectEntries` owns the data and its mutations, `useEntryForm` owns
 * the new/edit dialog, and the sections below only arrange what they are
 * given. The URL is the entry point for both actions: `?new=1` opens the
 * form and `?entry=<id>` opens one entry.
 */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const data = useProjectEntries(id);
  const form = useEntryForm({ id, fields: data.fields, writer: data });
  // Stable, so the two URL effects can name them as dependencies rather than
  // the whole form object, which is new on every render.
  const { openNew, openEdit } = form;

  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyEntry, setHistoryEntry] = useState<Entry | null>(null);
  const [formatHistoryOpen, setFormatHistoryOpen] = useState(false);
  const [formatVersions, setFormatVersions] = useState<FormatVersion[]>([]);

  // A project created offline gets a new id when it syncs; follow it there.
  useEffect(() => {
    if (!id?.startsWith("offline-")) return;
    const followSync = () => {
      const synced = resolveSyncedId(id);
      if (synced !== id) navigate(`/projects/${synced}`, { replace: true });
    };
    followSync();
    window.addEventListener(SYNC_EVENT, followSync);
    return () => window.removeEventListener(SYNC_EVENT, followSync);
  }, [id, navigate]);

  // The project N returns to (issue #92).
  useEffect(() => {
    if (id) rememberProject(id);
  }, [id]);

  // Arriving from the N shortcut: open a new entry once the project is here,
  // then drop the flag so a reload or Back does not open it again.
  useEffect(() => {
    if (searchParams.get("new") !== "1" || !data.project || data.project.id !== id) return;
    openNew();
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, data.project, id, openNew]);

  // Arriving from a link to a specific entry: open it once its row is in the
  // list, then drop the flag so a reload or Back does not reopen it. An entry
  // outside the current view (say, archived while this shows active) leaves
  // the flag alone rather than yanking the reader into another view.
  useEffect(() => {
    const entryId = searchParams.get("entry");
    if (!entryId || !data.project || data.project.id !== id) return;
    const target = data.entries.find((e) => e.id === entryId);
    if (!target) return;
    openEdit(target);
    const next = new URLSearchParams(searchParams);
    next.delete("entry");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, data.project, data.entries, id, openEdit]);

  const toggleArchive = async () => {
    await data.handleToggleArchive();
    setMoreOpen(false);
  };

  const openFormatHistory = async () => {
    if (!id) return;
    try {
      setFormatVersions(await fetchEntryFormatVersions(id));
      setFormatHistoryOpen(true);
    } catch {
      form.setEntryError("Couldn't load format history.");
    }
  };

  const isActive = data.project?.status === "ACTIVE";

  if (data.loading) return <LoadingState message="Loading project..." />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.load} />;
  if (!data.project) {
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
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition font-medium"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Projects
      </Link>

      <ProjectHeader
        project={data.project}
        active={isActive}
        moreOpen={moreOpen}
        onToggleMore={() => setMoreOpen(!moreOpen)}
        onToggleArchive={toggleArchive}
        onDelete={() => {
          setMoreOpen(false);
          setDeleteOpen(true);
        }}
      />

      {/* Stats */}
      {data.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={Clock} label="Total Time" value={formatDuration(data.summary.totalMinutes)} color="blue" />
          <StatCard icon={FileText} label="Entries" value={data.summary.entryCount} color="emerald" />
          <StatCard
            icon={CalendarDays}
            label="Last Entry"
            value={data.summary.lastEntryAt ? relativeDay(data.summary.lastEntryAt) : "—"}
            color="orange"
          />
        </div>
      )}

      {/* Entry Format */}
      {data.fields.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Entry Format</h2>
            <button type="button" onClick={openFormatHistory} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Format history</button>
          </div>
          <div className="p-4 space-y-2">
            {data.fields.map((f) => (
              <div key={f.id} className="flex items-center gap-3">
                {f.required ? (
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300 shrink-0" />
                )}
                <span className="text-sm font-medium text-slate-800 min-w-[120px]">
                  {f.name}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500">
                  {f.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation Rules (US26) — project configuration, so it sits beside
          the entry format rather than among the entries it acts on. */}
      {id && <AutomationRules projectId={id} />}

      <ProjectEntriesSection
        data={data}
        onNew={openNew}
        onEdit={openEdit}
        onHistory={setHistoryEntry}
      />

      <DeleteProjectModal
        project={deleteOpen ? data.project : null}
        entryCount={data.summary?.entryCount}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => navigate("/projects", { replace: true })}
        onArchiveInstead={async () => {
          setDeleteOpen(false);
          await toggleArchive();
        }}
      />

      <EntryHistoryModal
        entry={historyEntry}
        fields={data.fields}
        onClose={() => setHistoryEntry(null)}
        onRestored={data.handleVersionRestored}
      />

      <FormatHistoryModal
        open={formatHistoryOpen}
        onClose={() => setFormatHistoryOpen(false)}
        versions={formatVersions}
      />

      <EntryFormModal form={form} projectId={id} fields={data.fields} />
    </div>
  );
}
