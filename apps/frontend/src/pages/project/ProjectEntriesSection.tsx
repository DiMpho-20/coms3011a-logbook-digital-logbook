import { Archive, ArchiveRestore, Plus } from "lucide-react";

import type { Entry } from "../../api";
import EntryCard from "../../components/EntryCard";
import { dateHeading, type EntryView } from "./format";
import type { ProjectEntries } from "./useProjectEntries";

const VIEWS: readonly EntryView[] = ["active", "archived", "all"];

/**
 * The entries panel: which entries to show, the bulk action, the new-entry
 * button, and the entries themselves under the day they happened.
 *
 * Archived and active entries are the same list seen through a filter, so
 * the view toggle reloads rather than hides — nothing is ever counted as
 * deleted when it is only out of view.
 */
export default function ProjectEntriesSection({
  data,
  onNew,
  onEdit,
  onHistory,
}: {
  data: ProjectEntries;
  onNew: () => void;
  onEdit: (entry: Entry) => void;
  onHistory: (entry: Entry) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Entries</h2>
          <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs font-medium" role="group" aria-label="Which entries to show">
            {VIEWS.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => data.setEntryView(view)}
                aria-pressed={data.entryView === view}
                className={`px-2.5 py-1 transition ${
                  data.entryView === view ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {view === "active" ? "Active" : view === "archived" ? "Archived" : "All"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data.selectedIds.size > 0 && (
            <button
              type="button"
              onClick={data.handleArchiveSelected}
              className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              {data.bulkArchives ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
              {data.bulkArchives ? "Archive" : "Restore"} selected ({data.selectedIds.size})
            </button>
          )}
          <button
            onClick={onNew}
            title="New entry (N)"
            aria-keyshortcuts="N"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
          >
            <Plus className="h-3.5 w-3.5" /> New Entry
          </button>
        </div>
      </div>
      <div className="p-4">
        {data.archiveError && (
          <p className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {data.archiveError}
          </p>
        )}
        {data.groupedEntries.length === 0 && data.entryView === "archived" ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-400">No archived entries in this project.</p>
          </div>
        ) : data.groupedEntries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-400 mb-3">No entries logged for this project yet.</p>
            <button
              onClick={onNew}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Plus className="h-4 w-4" /> Add First Entry
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {data.groupedEntries.map(([dateKey, dayEntries]) => (
              <div key={dateKey}>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {dateHeading(dateKey)}
                </p>
                <div className="space-y-2">
                  {dayEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      fields={data.fields}
                      onEdit={onEdit}
                      onDelete={data.handleDeleteEntry}
                      onToggleChecklistItem={data.handleToggleChecklistItem}
                      onHistory={onHistory}
                      onArchive={data.handleArchiveEntry}
                      onDisableRecurrence={data.handleDisableRecurrence}
                      selected={data.selectedIds.has(entry.id)}
                      onSelect={data.handleSelectEntry}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
