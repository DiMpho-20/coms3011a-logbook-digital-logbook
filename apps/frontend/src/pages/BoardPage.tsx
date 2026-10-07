import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, Kanban } from "lucide-react";
import { api } from "../api/client";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { columnLabel, entryDateKey, fieldValueText, formatDuration } from "../lib/utils";

type Entry = {
  id: string;
  projectId: string;
  entryDate: string | null;
  createdAt: string;
  durationMinutes: number;
  status?: "OPEN" | "DONE";
  values: Record<string, unknown>;
};

type Field = {
  id: string;
  name: string;
  type: string;
};

type Project = { id: string; name: string; status?: string };

/** Grouping by an entry's own status rather than by one of its fields. */
const STATUS = "__status";

// A checklist is a to-do list inside one entry, and a computed value is a
// number that is rarely the same twice: neither makes useful columns.
const GROUPABLE = (f: Field) => f.type !== "COMPUTED" && f.type !== "CHECKLIST";

// Fields whose values repeat across entries make the best default board;
// a TEXT field is usually the description, one column per entry.
const DEFAULT_TYPES = ["TAGS", "BOOLEAN", "REFERENCE"];

const EMPTY = "—";

/** The columns an entry belongs in: one per tag, otherwise exactly one. */
function columnsFor(entry: Entry, groupBy: string, field: Field | undefined): string[] {
  if (groupBy === STATUS) return [entry.status === "DONE" ? "Done" : "Open"];
  const value = entry.values[groupBy];
  if (field?.type === "TAGS" && Array.isArray(value) && value.length > 0) {
    return [...new Set(value.map((tag) => columnLabel(tag)))];
  }
  if (field?.type === "BOOLEAN" && typeof value === "boolean") return [value ? "Yes" : "No"];
  return [columnLabel(value)];
}

export default function BoardPage() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [fields, setFields] = useState<Field[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [groupBy, setGroupBy] = useState(STATUS);

  const selectedProjectId = params.get("project") ?? "";

  useEffect(() => {
    api.get("/projects").then((res) => {
      // Active projects first; an archived one is still there to look back on.
      const all = res.data as Project[];
      const sorted = [...all.filter((p) => p.status !== "ARCHIVED"), ...all.filter((p) => p.status === "ARCHIVED")];
      setProjects(sorted);
      if (!params.get("project") && sorted.length > 0) {
        setParams({ project: sorted[0].id }, { replace: true });
      }
      setLoadingProjects(false);
    }).catch(() => setLoadingProjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      api.get(`/projects/${selectedProjectId}/entry-fields`),
      api.get(`/projects/${selectedProjectId}/entries`),
    ])
      .then(([fieldsRes, entriesRes]) => {
        const projectFields = fieldsRes.data as Field[];
        setFields(projectFields);
        setEntries(entriesRes.data);
        const preferred = projectFields.find((f) => DEFAULT_TYPES.includes(f.type));
        setGroupBy(preferred?.id ?? STATUS);
      })
      .catch(() => {
        setFields([]);
        setEntries([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  const groupFields = useMemo(() => fields.filter(GROUPABLE), [fields]);
  // The project's first TEXT field is what an entry is about, as on the Entries page.
  const descriptionField = useMemo(() => fields.find((f) => f.type === "TEXT"), [fields]);

  const columns = useMemo(() => {
    const field = fields.find((f) => f.id === groupBy);
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      for (const key of columnsFor(entry, groupBy, field)) {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(entry);
      }
    }
    // Open before Done; otherwise alphabetical, with entries that have no value last.
    const order = (key: string) => (groupBy === STATUS ? (key === "Open" ? 0 : 1) : key === EMPTY ? 1 : 0);
    return Array.from(map.entries()).sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b));
  }, [entries, groupBy, fields]);

  if (loadingProjects) {
    return (
      <div className="space-y-6" aria-busy="true">
        <span className="sr-only" role="status">Loading projects…</span>
        <Skeleton className="h-7 w-28" />
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-64" />)}
        </div>
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Board" subtitle="A project's entries in columns, grouped by status or by any of its fields." />
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState icon={Kanban} title="No projects yet." description="Create a project and log some entries to see them laid out in columns." />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      <PageHeader title="Board" subtitle="A project's entries in columns, grouped by status or by any of its fields." />

      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="board-project" className="block text-xs font-medium text-slate-500 mb-1">Project</label>
          <select
            id="board-project"
            value={selectedProjectId}
            onChange={(e) => setParams({ project: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.status === "ARCHIVED" ? `${p.name} (archived)` : p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="board-group" className="block text-xs font-medium text-slate-500 mb-1">Group by</label>
          <select
            id="board-group"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800"
          >
            <option value={STATUS}>Status (open / done)</option>
            {groupFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4" aria-busy="true" aria-label="Loading entries">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-64" />)}
        </div>
      ) : loadError ? (
        <p role="alert" className="text-sm text-red-600">Couldn't load this project's entries. Check your connection and try again.</p>
      ) : columns.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState compact icon={Kanban} title="This project has no entries yet." description="Entries you log in this project will appear here, grouped into columns." />
        </div>
      ) : (
        // On phones each column takes most of the width and snaps into place as you swipe.
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory sm:snap-none">
          {columns.map(([key, items]) => (
            <section
              key={key}
              aria-label={`${key}, ${items.length} ${items.length === 1 ? "entry" : "entries"}`}
              className="w-[85vw] sm:w-[280px] flex-shrink-0 snap-start rounded-xl border border-slate-200 bg-slate-50"
            >
              <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800 truncate" title={key}>{key}</span>
                <span className="rounded-full bg-white border border-slate-200 px-2 text-xs tabular-nums text-slate-600">{items.length}</span>
              </div>
              <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {items.map((e) => {
                  const description = descriptionField ? fieldValueText(e.values[descriptionField.id]) : "";
                  return (
                    <Link
                      key={e.id}
                      to={`/projects/${e.projectId}`}
                      className="block rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition duration-150 hover:border-slate-300 hover:shadow-sm"
                    >
                      <p className={`text-sm font-medium line-clamp-2 ${description ? "text-slate-800" : "text-slate-500 italic"}`}>
                        {description || "No description"}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>{entryDateKey(e)}</span>
                        {e.durationMinutes > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" /> {formatDuration(e.durationMinutes)}
                          </span>
                        )}
                        {e.status === "DONE" && groupBy !== STATUS && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
