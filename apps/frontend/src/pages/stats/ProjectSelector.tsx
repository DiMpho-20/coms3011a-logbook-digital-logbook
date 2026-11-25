import type { Project } from "../../api";
import { labelClass, selectClass } from "./format";

/** Which project the statistics below are worked out for. */
export default function ProjectSelector({
  projects,
  selectedProjectId,
  onSelect,
}: {
  projects: Project[];
  selectedProjectId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border-t border-slate-200 pt-6">
      <h2 id="project-statistics-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Project statistics
      </h2>
      <div className="mt-3 max-w-sm">
        <label htmlFor="stats-project" className={labelClass}>Project</label>
        <select
          id="stats-project"
          value={selectedProjectId}
          onChange={(e) => onSelect(e.target.value)}
          aria-describedby="stats-project-hint"
          className={selectClass}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <p id="stats-project-hint" className="mt-1.5 text-xs text-slate-500">The sections below are calculated for this project.</p>
    </div>
  );
}
