import { BookmarkPlus, X } from "lucide-react";

import type { EntryField } from "../../api";
import { button, inputClass } from "../../lib/ui";
import { describeFieldFilter } from "./filters";
import type { EntryFilters } from "./useEntryFilters";

/**
 * What is currently filtering the list, in words, under the bar.
 *
 * Field filters stay visible with the panel closed so nothing is filtered
 * out of sight; saved filters sit beside them, one click to apply or delete.
 */
export default function FilterSummary({
  filters,
  fieldsByProject,
}: {
  filters: EntryFilters;
  /** Field names for the filter chips, which may span several projects. */
  fieldsByProject: Record<string, EntryField[]>;
}) {
  return (
    <>
      {/* Active field filters stay visible with the panel closed, so nothing is filtered out of sight. */}
      {filters.fieldFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-slate-500">Field filters</span>
          {filters.fieldFilters.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200"
            >
              {describeFieldFilter(f, fieldsByProject)}
              <button
                onClick={() => filters.removeFieldFilter(i)}
                className="rounded-full p-1 hover:bg-blue-100 transition-colors duration-150"
                aria-label={`Remove filter: ${describeFieldFilter(f, fieldsByProject)}`}
                title="Remove this filter"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {(filters.filtersActive || filters.savedFilters.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.savedFilters.length > 0 && <span className="text-xs font-medium text-slate-500">Saved</span>}
          {filters.savedFilters.map((f) => {
            const isActive = filters.activeFilterId === f.id;
            return (
              <span
                key={f.id}
                className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium border transition-colors duration-150 ${
                  isActive
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
                title={`Apply "${f.name}"`}
              >
                <button onClick={() => filters.applySavedFilter(f)} aria-pressed={isActive}>
                  {f.name}
                </button>
                <button
                  onClick={() => filters.handleDeleteFilter(f.id)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors duration-150"
                  aria-label={`Delete saved filter ${f.name}`}
                  title={`Delete "${f.name}"`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            );
          })}
          {filters.filtersActive && (
            <span className="ml-auto flex items-center gap-1">
              <button
                onClick={filters.toggleSaveInput}
                className={button("ghost", "sm")}
                title="Save the current filter combination"
              >
                <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Save
              </button>
              <button onClick={filters.clearFilters} className={button("ghost", "sm")}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Clear filters
              </button>
            </span>
          )}
        </div>
      )}

      {filters.showSaveInput && filters.filtersActive && (
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            autoFocus
            placeholder="Name this filter (e.g. Lab work, overdue)"
            aria-label="Filter name"
            value={filters.filterName}
            onChange={(e) => filters.setFilterName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") filters.handleSaveFilter();
              if (e.key === "Escape") filters.setShowSaveInput(false);
            }}
            className={`${inputClass} flex-1 min-w-[200px] max-w-sm`}
          />
          <button onClick={filters.handleSaveFilter} disabled={!filters.filterName.trim()} className={button("primary", "sm")}>
            Save filter
          </button>
          <button
            onClick={() => {
              filters.setShowSaveInput(false);
              filters.setFilterName("");
            }}
            className={button("ghost", "sm")}
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
