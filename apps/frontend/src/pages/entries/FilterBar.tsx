import { Search, Filter, Plus, ChevronDown } from "lucide-react";

import type { EntryField, Project } from "../../api";
import TagFilterBar from "../../components/TagFilterBar";
import { button, inputClass } from "../../lib/ui";
import { OPERATORS_BY_TYPE, selectClass } from "./filters";
import type { EntryFilters } from "./useEntryFilters";

/**
 * The one filter bar: search, project and order always visible; the less
 * common filters behind the Filters button, counted on it when any are on.
 *
 * Every control edits the draft. Nothing is fetched until Search is pressed,
 * which is what the bar's single Search button is for.
 */
export default function FilterBar({
  filters,
  projects,
  fieldsByProject,
}: {
  filters: EntryFilters;
  projects: Project[];
  /** The selected project's own fields, for the field filter. */
  fieldsByProject: Record<string, EntryField[]>;
}) {
  const selectedProjectFields = filters.projectId === "all" ? [] : fieldsByProject[filters.projectId] ?? [];
  const currentField = selectedProjectFields.find((f) => f.id === filters.newFilterFieldId);
  const availableOps = currentField ? OPERATORS_BY_TYPE[currentField.type] || [] : [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <div className="relative basis-full sm:basis-auto sm:flex-1 sm:min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search entries..."
            aria-label="Search entries"
            value={filters.searchQuery}
            onChange={(e) => {
              filters.markManualChange();
              filters.setSearchQuery(e.target.value);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") filters.applySearch(); }}
            className={`${inputClass} h-10 pl-9`}
          />
        </div>
        <select
          value={filters.projectId}
          aria-label="Project"
          onChange={(e) => filters.chooseProject(e.target.value)}
          className={`${selectClass} min-w-0 flex-1 sm:flex-none sm:max-w-[200px] max-sm:basis-full`}
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filters.sort}
          aria-label="Sort order"
          onChange={(e) => {
            filters.markManualChange();
            filters.setSort(e.target.value as "newest" | "oldest");
          }}
          className={`${selectClass} flex-1 sm:flex-none`}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button
          type="button"
          onClick={filters.toggleFilters}
          aria-expanded={filters.showFilters}
          aria-controls="entry-filters"
          className={`${button("secondary")} flex-1 sm:flex-none ${filters.showFilters ? "bg-slate-50" : ""}`}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filters
          {filters.advancedCount > 0 && (
            <span className="rounded-full bg-blue-50 px-1.5 text-xs font-semibold tabular-nums text-blue-700">
              {filters.advancedCount}<span className="sr-only"> active</span>
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-150 ${filters.showFilters ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {/* Applies every draft filter at once, as it always has. */}
        <button onClick={filters.applySearch} className={`${button("secondary")} flex-1 sm:flex-none`}>
          <Search className="h-4 w-4" aria-hidden="true" />
          Search
        </button>
      </div>

      {filters.showFilters && (
        <div id="entry-filters" className="space-y-4 border-t border-slate-100 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Show</span>
              <select
                value={filters.tab}
                onChange={(e) => {
                  filters.markManualChange();
                  filters.setTab(e.target.value as "all" | "week" | "overdue");
                }}
                className={`${selectClass} w-full`}
              >
                <option value="all">All entries</option>
                <option value="week">This week</option>
                <option value="overdue">Overdue</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Archive</span>
              <select
                value={filters.archived}
                onChange={(e) => {
                  filters.markManualChange();
                  filters.setArchived(e.target.value as typeof filters.archived);
                }}
                aria-label="Archived entries"
                className={`${selectClass} w-full`}
              >
                <option value="exclude">Active entries</option>
                <option value="include">Include archived</option>
                <option value="only">Archived only</option>
              </select>
            </label>

            {/* Field filter: a project's own fields, so it needs a project chosen. */}
            <div className="relative">
              <span className="mb-1 block text-xs font-medium text-slate-600">Fields</span>
              <button
                onClick={filters.toggleFilterPopover}
                disabled={filters.projectId === "all"}
                aria-expanded={filters.showFilterPopover}
                className={`${button("secondary")} w-full justify-start`}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Field filter
              </button>
              {filters.projectId === "all" && (
                <p className="mt-1 text-xs text-slate-500">Choose a project to filter by its fields.</p>
              )}
              {filters.showFilterPopover && (
                <div className="absolute top-full left-0 z-20 mt-1 w-full min-w-[16rem] space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg sm:w-80">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Field</label>
                    <select
                      value={filters.newFilterFieldId}
                      onChange={(e) => filters.chooseFilterField(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Choose a field…</option>
                      {selectedProjectFields.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
                      ))}
                    </select>
                  </div>
                  {currentField && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Operator</label>
                      <select value={filters.newFilterOp} onChange={(e) => filters.setNewFilterOp(e.target.value)} className={inputClass}>
                        <option value="">Choose…</option>
                        {availableOps.map((op) => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {currentField !== undefined && filters.newFilterOp && filters.newFilterOp !== "is_true" && filters.newFilterOp !== "is_false" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
                      <input
                        type={currentField.type === "NUMBER" ? "number" : currentField.type === "DATE" ? "date" : "text"}
                        value={filters.newFilterValue}
                        onChange={(e) => filters.setNewFilterValue(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={filters.closeFilterPopover} className={button("ghost", "sm")}>
                      Cancel
                    </button>
                    <button
                      onClick={filters.addFieldFilter}
                      disabled={!filters.newFilterFieldId || !filters.newFilterOp}
                      className={button("primary", "sm")}
                    >
                      Add filter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <TagFilterBar
            tags={filters.availableTags}
            selected={filters.tags}
            onChange={(tags) => {
              filters.markManualChange();
              filters.setTags(tags);
            }}
          />
        </div>
      )}
    </div>
  );
}
