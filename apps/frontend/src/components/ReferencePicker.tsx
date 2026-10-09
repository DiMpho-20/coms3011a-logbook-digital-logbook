import { useEffect, useMemo, useState } from "react";
import { fetchAllEntries, type Entry, type EntryFieldValue, type Project } from "../api";

interface ReferencePickerProps {
  /** Every project the account has; the one being logged against is filtered out here. */
  projects: Project[];
  /** Entries of this project are not offered — an entry does not link to itself. */
  currentProjectId?: string;
  /** While editing, the entry on the table is not a valid target either. */
  excludeEntryId?: string;
  value: EntryFieldValue;
  onChange: (value: EntryFieldValue) => void;
  className?: string;
}

interface EntryOption {
  id: string;
  projectId: string;
  label: string;
}

/** Names an entry inside the picker: "Reading · Sep 30 · chapter 2 notes". */
function entryLabel(entry: Entry, projectName: string): string {
  const date = new Date(entry.entryDate ?? entry.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const snippet = Object.values(entry.values ?? {}).find(
    (v): v is string => typeof v === "string" && v.trim() !== ""
  );
  return [projectName, date, snippet ? (snippet.length > 40 ? `${snippet.slice(0, 40)}…` : snippet) : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A REFERENCE field points at another project or, since entry-to-entry
 * linking, at one of its entries. One select with two groups: the projects,
 * then recent entries from across the logbook. Recent is a pool, not an
 * index — a reference saved earlier can point outside it, so a stored value
 * that matches no option is kept visible rather than reading as empty.
 */
export default function ReferencePicker({
  projects,
  currentProjectId,
  excludeEntryId,
  value,
  onChange,
  className,
}: ReferencePickerProps) {
  const [recent, setRecent] = useState<EntryOption[] | null>(null);

  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== currentProjectId),
    [projects, currentProjectId]
  );
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  useEffect(() => {
    let cancelled = false;
    fetchAllEntries({ limit: 200 })
      .then(({ entries }) => {
        if (cancelled) return;
        setRecent(
          entries
            .filter((e) => e.id !== excludeEntryId && e.projectId !== currentProjectId)
            .map((e) => ({
              id: e.id,
              projectId: e.projectId,
              label: entryLabel(e, projectName.get(e.projectId) ?? "Project"),
            }))
        );
      })
      .catch(() => {
        // Offline or slow: projects can still be linked; entries just wait.
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [excludeEntryId, currentProjectId, projectName]);

  const reference =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { id?: string; label?: string; kind?: string; projectId?: string })
      : null;

  const handleChange = (id: string) => {
    const project = otherProjects.find((p) => p.id === id);
    if (project) {
      onChange({ id: project.id, label: project.name, kind: "project" });
      return;
    }
    const entry = recent?.find((e) => e.id === id);
    if (entry) {
      onChange({ id: entry.id, label: entry.label, kind: "entry", projectId: entry.projectId });
      return;
    }
    onChange(null);
  };

  const storedIsListed =
    !reference?.id ||
    otherProjects.some((p) => p.id === reference.id) ||
    (recent?.some((e) => e.id === reference.id) ?? false);

  return (
    <select
      value={reference?.id ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      className={className}
    >
      <option value="">— Nothing linked —</option>
      {reference?.id && !storedIsListed && (
        <option value={reference.id}>{reference.label || reference.id}</option>
      )}
      <optgroup label="Projects">
        {otherProjects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </optgroup>
      {recent && recent.length > 0 && (
        <optgroup label="Recent entries">
          {recent.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
