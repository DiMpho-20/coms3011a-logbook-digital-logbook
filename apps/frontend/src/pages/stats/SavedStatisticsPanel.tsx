import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";

import { button } from "../../lib/ui";
import { ErrorLine } from "./Feedback";
import Panel from "./Panel";
import { formatNumber } from "./format";
import type { SavedStatistics } from "./useSavedStatistics";

/**
 * The project's own named calculations, each worked out from the current
 * entries whenever the list is fetched. A statistic that has stopped working
 * is still listed, with the reason, so it can be fixed rather than lost.
 */
export default function SavedStatisticsPanel({ saved }: { saved: SavedStatistics }) {
  return (
    <Panel
      level={3}
      title="Your saved statistics"
      description="Your own calculations for this project, worked out again from the current entries each time."
      action={
        saved.saved.length > 0 && (
          <button type="button" onClick={() => saved.openNewStatistic()} className={button("secondary", "sm")}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New statistic
          </button>
        )
      }
    >
      {saved.loadingSaved ? (
        <p className="text-xs text-slate-500">Loading your statistics…</p>
      ) : saved.savedError ? (
        <ErrorLine text={saved.savedError} />
      ) : saved.saved.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
          <p className="text-sm font-medium text-slate-800">No saved statistics yet</p>
          <p className="mt-0.5 text-sm text-slate-500">
            Create one when you want to calculate something custom.
          </p>
          <button type="button" onClick={() => saved.openNewStatistic()} className={`${button("secondary", "sm")} mt-3`}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New statistic
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {saved.saved.map((statistic) => (
            <li key={statistic.id} className="flex flex-col rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold text-slate-900">{statistic.name}</p>
                <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => saved.openEditStatistic(statistic)}
                    aria-label={`Edit ${statistic.name}`}
                    title={`Edit ${statistic.name}`}
                    className="rounded-md p-2 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => saved.selectForDeletion(statistic)}
                    aria-label={`Delete ${statistic.name}`}
                    title={`Delete ${statistic.name}`}
                    className="rounded-md p-2 text-slate-500 transition-colors duration-150 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{statistic.expression}</p>
              {statistic.error ? (
                // A saved statistic can stop working — its field may have
                // been renamed since — so it says so instead of vanishing.
                <p className="mt-3 flex items-start gap-1.5 text-xs text-red-700">
                  <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{statistic.error}</span>
                </p>
              ) : (
                <p className="mt-3 text-2xl font-semibold tabular-nums leading-tight text-slate-900">
                  {statistic.value === null ? "—" : formatNumber(statistic.value)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
