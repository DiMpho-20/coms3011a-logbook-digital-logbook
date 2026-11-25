import { useNavigate } from "react-router-dom";
import { FolderOpen } from "lucide-react";
import Skeleton from "../../../components/Skeleton";
import TagList from "../../../components/TagList";
import DeadlineReminders from "../../../components/DeadlineReminders";
import { formatDuration } from "../../../lib/utils";
import type { Entry, EntryField } from "../../../api";
import { entrySummary, relativeDay } from "../entryText";

export interface ProjectTime {
  id: string;
  name: string;
  tags: string[];
  minutes: number;
}

export function CurrentProjectsPanel({ projects }: { projects: ProjectTime[] }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Current Projects</h2>
        <button onClick={() => navigate("/projects")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all</button>
      </div>
      <div className="p-4">
        {projects.length === 0 ? (
          <div className="text-center py-8">
            <FolderOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No active projects.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)} className="w-full flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-slate-50 transition text-left group">
                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition">{project.name}</p>
                  <TagList tags={project.tags} className="mt-1" />
                </div>
                <span className="text-xs font-medium text-slate-500 shrink-0">{formatDuration(project.minutes)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TagsPanel({ tags }: { tags: { name: string; count: number }[] }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Tags</h2>
        <button onClick={() => navigate("/entries")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Browse entries</button>
      </div>
      <div className="p-4">
        {tags.length === 0 ? <p className="text-sm text-slate-400">No tags yet. Add a tag to a project or entry to see it here.</p> : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag.name} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                {tag.name}<span className="px-1.5 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-blue-600">{tag.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function RecentEntriesPanel({
  entries, projectNames, fieldsByProject,
}: {
  entries: Entry[];
  projectNames: Record<string, string>;
  fieldsByProject: Record<string, EntryField[]>;
}) {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Recent Entries</h2>
        <button onClick={() => navigate("/entries")} className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all</button>
      </div>
      {entries.length === 0 ? <div className="text-center py-12"><p className="text-sm text-slate-400">No entries yet. Start logging work to see activity here.</p></div> : (
        <div className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <div key={entry.id} className="px-4 py-3 hover:bg-slate-50/50 transition">
              {/* On a phone the title gets its own line; one row left it a few letters wide. */}
              <div className="flex items-center gap-4 max-sm:flex-wrap max-sm:gap-x-3 max-sm:gap-y-1">
                <span className="text-[11px] font-medium text-slate-400 w-16 shrink-0">{relativeDay(entry.entryDate || entry.createdAt)}</span>
                <span className="text-sm text-slate-800 flex-1 min-w-0 truncate max-sm:order-last max-sm:basis-full max-sm:flex-none">{entrySummary(entry, fieldsByProject[entry.projectId] || [])}</span>
                <span className="text-xs font-medium text-slate-600 shrink-0 w-16 text-right">{formatDuration(entry.durationMinutes)}</span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 shrink-0 max-sm:ml-auto max-sm:min-w-0 max-sm:max-w-[55%] max-sm:shrink max-sm:truncate">{projectNames[entry.projectId] || "Unknown"}</span>
              </div>
              <TagList tags={entry.tags} className="mt-1.5 ml-[72px] max-sm:ml-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeadlineRemindersPanel({
  entries, projectNames, loading,
}: {
  entries: Entry[];
  projectNames: Record<string, string>;
  loading: boolean;
}) {
  return loading ? (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-3 w-56" />
    </div>
  ) : <DeadlineReminders entries={entries} projectNames={projectNames} />;
}
