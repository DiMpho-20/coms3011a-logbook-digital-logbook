import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Kanban, Loader2 } from "lucide-react";
import { api } from "../api/client";
import { columnLabel, entryDateKey } from "../lib/utils";

type Entry = {
  id: string;
  projectId: string;
  entryDate: string | null;
  createdAt: string;
  durationMinutes: number;
  values: Record<string, any>;
};

type Field = {
  id: string;
  name: string;
  type: string;
};

export default function BoardPage() {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [fields, setFields] = useState<Field[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupByFieldId, setGroupByFieldId] = useState("");

  const selectedProjectId = params.get("project") ?? "";

  useEffect(() => {
    api.get("/projects").then((res) => {
      setProjects(res.data);
      if (!params.get("project") && res.data.length > 0) {
        setParams({ project: res.data[0].id });
      }
      setLoadingProjects(false);
    }).catch(() => setLoadingProjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    setLoading(true);
    Promise.all([
      api.get(`/projects/${selectedProjectId}/entry-fields`),
      api.get(`/projects/${selectedProjectId}/entries`),
    ])
      .then(([fieldsRes, entriesRes]) => {
        const usable = (fieldsRes.data as Field[]).filter((f) => f.type !== "COMPUTED");
        setFields(usable);
        setEntries(entriesRes.data);
        setGroupByFieldId(usable[0]?.id ?? "");
      })
      .catch(() => {
        setFields([]);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  const columns = useMemo(() => {
    if (!groupByFieldId) return [];
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      const key = columnLabel(entry.values[groupByFieldId]);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries, groupByFieldId]);

  if (loadingProjects) return <p className="text-sm text-slate-500">Loading projects…</p>;
  if (projects.length === 0) return <p className="text-sm text-slate-500">No projects yet.</p>;

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex items-center gap-2">
        <Kanban className="h-5 w-5 text-cyan-600" />
        <h1 className="text-xl font-semibold text-slate-900">Board</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Project</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setParams({ project: e.target.value })}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Group by</label>
          <select
            value={groupByFieldId}
            onChange={(e) => setGroupByFieldId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800"
          >
            {fields.length === 0 && <option value="">No fields</option>}
            {fields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : columns.length === 0 ? (
        <p className="text-sm text-slate-500">No entries to show, or no field selected.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columns.map(([key, items]) => (
            <div key={key} className="min-w-[260px] flex-shrink-0 rounded-lg border border-slate-200 bg-slate-50">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 truncate">{key}</span>
                <span className="text-[10px] text-slate-500">{items.length}</span>
              </div>
              <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {items.map((e) => (
                  <Link
                    key={e.id}
                    to={`/projects/${e.projectId}`}
                    className="block rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-cyan-300 hover:bg-cyan-50/40 transition"
                  >
                    <p className="text-xs text-slate-700 font-medium">
                      {e.durationMinutes} min
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {entryDateKey(e)}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}