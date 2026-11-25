import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, CircleAlert, Clock, Kanban } from "lucide-react";
import { api } from "../api/client";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import Skeleton from "../components/Skeleton";
import { button } from "../lib/ui";
import { columnLabel, entryDateKey, fieldValueText, formatDuration } from "../lib/utils";

type Entry = {
  id: string;
  projectId: string;
  entryDate: string | null;
  createdAt: string;
  durationMinutes: number;
  status?: "OPEN" | "DONE";
  dueDate?: string | null;
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

/** "1 Sep" from a "YYYY-MM-DD" day, without a time zone moving it. */
const shortDay = (day: string) =>
  new Date(`${day.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

const selectClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 sm:w-64";

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
  const [projectsFailed, setProjectsFailed] = useState(false);
  // Bumped by "Try again" to load the same project's entries once more.
  const [reloadKey, setReloadKey] = useState(0);
  const [fields, setFields] = useState<Field[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [groupBy, setGroupBy] = useState(STATUS);

  const selectedProjectId = params.get("project") ?? projects[0]?.id ?? "";

  const loadProjects = useCallback(() => {
    setLoadingProjects(true);
    setProjectsFailed(false);
    api.get("/projects").then((res) => {
      // Active projects first; an archived one is still there to look back on.
      const all = res.data as Project[];
      const sorted = [...all.filter((p) => p.status !== "ARCHIVED"), ...all.filter((p) => p.status === "ARCHIVED")];
      setProjects(sorted);
      setLoadingProjects(false);
    }).catch(() => {
      setProjectsFailed(true);
      setLoadingProjects(false);
    });
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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
  }, [selectedProjectId, reloadKey]);

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
    // An entry's status is always Open or Done, so both columns show even when one is empty.
    if (groupBy === STATUS && entries.length > 0) {
      for (const key of ["Open", "Done"]) if (!map.has(key)) map.set(key, []);
    }
    // Open before Done; otherwise alphabetical, with entries that have no value last.
    const order = (key: string) => (groupBy === STATUS ? (key === "Open" ? 0 : 1) : key === EMPTY ? 1 : 0);
    return Array.from(map.entries()).sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b));
  }, [entries, groupBy, fields]);

  const groupField = fields.find((f) => f.id === groupBy);
  const header = <PageHeader title="Board" subtitle="One project's entries in columns." />;

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
  if (projectsFailed) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            icon={CircleAlert}
            title="Your projects couldn't be loaded"
            description="The board shows one project at a time, so there's nothing to show yet. Check your connection and try again."
            action={<button onClick={loadProjects} className={button("secondary")}>Try again</button>}
          />
        </div>
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState icon={Kanban} title="No projects yet." description="Create a project and log some entries to see them laid out in columns." />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {header}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <label htmlFor="board-project" className="block text-xs font-medium text-slate-600 mb-1">Project</label>
          <select
            id="board-project"
            value={selectedProjectId}
            onChange={(e) => setParams({ project: e.target.value })}
            className={selectClass}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.status === "ARCHIVED" ? `${p.name} (archived)` : p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="board-group" className="block text-xs font-medium text-slate-600 mb-1">Group by</label>
          <select
            id="board-group"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className={`${selectClass} sm:w-56`}
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
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-64 rounded-xl" />)}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState
            compact
            icon={CircleAlert}
            title="Couldn't load this project's entries."
            description="Check your connection and try again. Nothing has changed in the project."
            action={<button onClick={() => setReloadKey((k) => k + 1)} className={button("secondary", "sm")}>Try again</button>}
          />
        </div>
      ) : columns.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <EmptyState compact icon={Kanban} title="This project has no entries yet." description="Entries you log in this project will appear here, grouped into columns." />
        </div>
      ) : (
        // The board scrolls sideways inside itself; on phones each column takes most of the width and snaps into place.
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 snap-x snap-mandatory sm:snap-none" role="list" aria-label="Board columns">
          {columns.map(([key, items]) => {
            // The catch-all for entries with no value in the chosen field: kept, but quieter.
            const notGrouped = groupBy !== STATUS && key === EMPTY;
            const title = notGrouped ? "Not grouped" : key;
            return (
              <section
                key={key}
                role="listitem"
                aria-label={`${title}, ${items.length} ${items.length === 1 ? "entry" : "entries"}`}
                className={`flex w-[85vw] max-w-[320px] flex-shrink-0 snap-start flex-col rounded-xl border sm:w-[300px] ${
                  notGrouped ? "border-dashed border-slate-300 bg-transparent" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
                  <div className="min-w-0">
                    <h2 className={`truncate text-sm font-semibold ${notGrouped ? "text-slate-500" : "text-slate-800"}`} title={key}>
                      {title}
                    </h2>
                    {notGrouped && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Entries with no {groupField?.name ?? "value"} set.
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 text-xs tabular-nums text-slate-600">
                    {items.length}
                  </span>
                </div>
                <div className="max-h-[70vh] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {items.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-slate-500">No entries here yet.</p>
                  ) : (
                    items.map((e) => {
                      const description = descriptionField ? fieldValueText(e.values[descriptionField.id]) : "";
                      return (
                        <Link
                          key={e.id}
                          // Opens the entry itself on its project page, where it can be edited or deleted.
                          to={`/projects/${e.projectId}?entry=${e.id}`}
                          className="block rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors duration-150 hover:border-slate-300"
                        >
                          <p className={`text-sm font-medium line-clamp-2 break-words ${description ? "text-slate-900" : "text-slate-500 italic"}`}>
                            {description || "No description"}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                            <span className="tabular-nums">{shortDay(entryDateKey(e))}</span>
                            {e.durationMinutes > 0 && (
                              <span className="inline-flex items-center gap-0.5 tabular-nums">
                                <Clock className="h-3 w-3" aria-hidden="true" /> {formatDuration(e.durationMinutes)}
                              </span>
                            )}
                            {e.status === "DONE" && groupBy !== STATUS && (
                              <span className="inline-flex items-center gap-0.5 text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Done
                              </span>
                            )}
                          </p>
                          {e.dueDate && (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600">
                              <CalendarClock className="h-3 w-3 text-slate-400" aria-hidden="true" /> Due {shortDay(e.dueDate)}
                            </p>
                          )}
                        </Link>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
