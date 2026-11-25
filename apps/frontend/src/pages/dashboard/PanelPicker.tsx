import { ChevronDown, ChevronUp } from "lucide-react";
import Modal from "../../components/Modal";
import type { CustomStatistic } from "../../api";
import { DASHBOARD_PANELS, statisticPanelId, type DashboardPanelId } from "../../lib/dashboardPreferences";

/**
 * The "Customize dashboard" dialog: every panel the student could have,
 * the ones they have in their own order, and the arrows to change it.
 *
 * Nothing here is saved until Save is pressed — Cancel and closing leave
 * the dashboard exactly as it was.
 */
export default function PanelPicker({
  open,
  onClose,
  draftPanels,
  availableStatistics,
  panelDetail,
  onToggle,
  onMove,
  onRestoreDefaults,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  draftPanels: DashboardPanelId[];
  /** null until the saved statistics have been fetched. */
  availableStatistics: CustomStatistic[] | null;
  /** The name and one-line explanation of one panel. */
  panelDetail: (panel: DashboardPanelId) => { title: string; description: string };
  onToggle: (panel: DashboardPanelId) => void;
  onMove: (panel: DashboardPanelId, direction: -1 | 1) => void;
  onRestoreDefaults: () => void;
  onSave: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Customize dashboard" wide>
      <p className="mb-4 text-sm text-slate-500">Choose the statistics and information you want to monitor, then use the arrows to arrange selected panels. Your layout is saved to your account, so it's the same on every device.</p>
      <fieldset className="space-y-2">
        <legend className="sr-only">Dashboard panels</legend>
        {[
          ...draftPanels,
          ...DASHBOARD_PANELS.filter((panel) => !draftPanels.includes(panel)),
          ...(availableStatistics ?? [])
            .map((statistic) => statisticPanelId(statistic.projectId, statistic.id))
            .filter((panel) => !draftPanels.includes(panel)),
        ].map((panel) => {
          const detail = panelDetail(panel);
          const panelIndex = draftPanels.indexOf(panel);
          const selected = panelIndex >= 0;
          return (
            <div key={panel} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <label className="flex flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(panel)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{detail.title}</span>
                  <span className="block text-xs text-slate-500">{detail.description}</span>
                </span>
              </label>
              {selected && (
                <div className="flex shrink-0 flex-col" aria-label={`${detail.title} position`}>
                  <button
                    type="button"
                    onClick={() => onMove(panel, -1)}
                    disabled={panelIndex === 0}
                    aria-label={`Move ${detail.title} up`}
                    className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                  ><ChevronUp className="h-4 w-4" /></button>
                  <button
                    type="button"
                    onClick={() => onMove(panel, 1)}
                    disabled={panelIndex === draftPanels.length - 1}
                    aria-label={`Move ${detail.title} down`}
                    className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                  ><ChevronDown className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
      <p className="mt-3 text-xs text-slate-500">
        {availableStatistics === null
          ? "Loading your saved statistics…"
          : availableStatistics.length === 0
            ? "Statistics you save on the Stats page can be added here too."
            : "Your saved statistics from the Stats page are listed with the other panels."}
      </p>
      <div className="mt-5 flex items-center justify-between gap-3">
        <button onClick={onRestoreDefaults} className="text-sm font-medium text-blue-600 hover:text-blue-700">Restore defaults</button>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button onClick={onSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Save dashboard</button>
        </div>
      </div>
    </Modal>
  );
}
