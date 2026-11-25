import { useEffect, useState, type DragEvent } from "react";
import {
  fetchProjectStatistic,
  fetchProjectStatistics,
  type CustomStatistic,
  type Project,
} from "../../api";
import {
  DEFAULT_DASHBOARD_PANELS,
  isBuiltInPanel,
  loadDashboardPanels,
  parseStatisticPanel,
  persistDashboardPanels,
  resetDashboardPanels,
  statisticPanelId,
  syncDashboardPanels,
  type DashboardPanelId,
} from "../../lib/dashboardPreferences";
import { DASHBOARD_PANEL_DETAILS } from "./panelDetails";
import type { StatisticState } from "./statisticState";

export interface PanelLayout {
  selectedPanels: DashboardPanelId[];
  draftPanels: DashboardPanelId[];
  panelPickerOpen: boolean;
  arrangingPanels: boolean;
  draggedPanel: DashboardPanelId | null;
  dragOverPanel: DashboardPanelId | null;
  /** Saved statistics on the dashboard, by panel id. */
  statistics: Record<string, StatisticState>;
  /** Every saved statistic the picker can offer; null until the picker loads them. */
  availableStatistics: CustomStatistic[] | null;
  layoutSaveFailed: boolean;
  setPanelPickerOpen: (open: boolean) => void;
  toggleArranging: () => void;
  setDraggedPanel: (panel: DashboardPanelId | null) => void;
  setDragOverPanel: (panel: DashboardPanelId | null) => void;
  openPanelPicker: () => void;
  closePanelPicker: () => void;
  panelDetail: (panel: DashboardPanelId) => { title: string; description: string };
  removePanel: (panel: DashboardPanelId) => void;
  toggleDraftPanel: (panel: DashboardPanelId) => void;
  savePanelSelection: () => void;
  moveDraftPanel: (panel: DashboardPanelId, direction: -1 | 1) => void;
  restoreDefaultLayout: () => void;
  handlePanelDrop: (destination: DashboardPanelId, event: DragEvent<HTMLElement>) => void;
}

/**
 * Which panels the dashboard shows, in what order, and whether that order
 * has been saved.
 *
 * The layout is the student's: kept on this device first, then on their
 * account so it follows them. The statistics behind statistic panels are
 * load-on-demand, because only the ones on the dashboard are worth asking
 * for.
 */
export function usePanelLayout({
  projects, projectNames,
}: {
  projects: Project[];
  projectNames: Record<string, string>;
}): PanelLayout {
  const [selectedPanels, setSelectedPanels] = useState<DashboardPanelId[]>(loadDashboardPanels);
  const [panelPickerOpen, setPanelPickerOpen] = useState(false);
  const [draftPanels, setDraftPanels] = useState<DashboardPanelId[]>(selectedPanels);
  const [arrangingPanels, setArrangingPanels] = useState(false);
  const [draggedPanel, setDraggedPanel] = useState<DashboardPanelId | null>(null);
  const [dragOverPanel, setDragOverPanel] = useState<DashboardPanelId | null>(null);
  const [statistics, setStatistics] = useState<Record<string, StatisticState>>({});
  const [availableStatistics, setAvailableStatistics] = useState<CustomStatistic[] | null>(null);
  const [layoutSaveFailed, setLayoutSaveFailed] = useState(false);

  // The page opens with this device's copy of the layout; the one saved on
  // the server (from any device) replaces it once it arrives.
  useEffect(() => {
    let cancelled = false;
    syncDashboardPanels().then((panels) => {
      if (!cancelled && panels) setSelectedPanels(panels);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the current value of each saved statistic on the dashboard.
  useEffect(() => {
    const unloaded = selectedPanels.filter((panel) => parseStatisticPanel(panel) && !(panel in statistics));
    if (unloaded.length === 0) return;
    setStatistics((current) => ({
      ...current,
      ...Object.fromEntries(unloaded.map((panel) => [panel, { status: "loading" } as StatisticState])),
    }));
    unloaded.forEach((panel) => {
      const { projectId, statisticId } = parseStatisticPanel(panel)!;
      fetchProjectStatistic(projectId, statisticId)
        .then((statistic): StatisticState => ({ status: "ready", statistic }))
        .catch((error): StatisticState =>
          error?.response?.status === 404 ? { status: "missing" } : { status: "failed" }
        )
        .then((state) => setStatistics((current) => ({ ...current, [panel]: state })));
    });
  }, [selectedPanels, statistics]);

  const persist = (panels: DashboardPanelId[]) => {
    persistDashboardPanels(panels).then((saved) => setLayoutSaveFailed(!saved));
  };

  const openPanelPicker = () => {
    setDraftPanels(selectedPanels);
    setPanelPickerOpen(true);
    if (availableStatistics === null) {
      // Statistics are saved per project, so ask each active project.
      Promise.allSettled(
        projects.filter((p) => p.status === "ACTIVE").map((p) => fetchProjectStatistics(p.id))
      ).then((results) => {
        const found = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
        setAvailableStatistics(found);
        setStatistics((current) => ({
          ...current,
          ...Object.fromEntries(
            found.map((statistic) => [
              statisticPanelId(statistic.projectId, statistic.id),
              { status: "ready", statistic } as StatisticState,
            ])
          ),
        }));
      });
    }
  };

  const panelDetail = (panel: DashboardPanelId): { title: string; description: string } => {
    if (isBuiltInPanel(panel)) return DASHBOARD_PANEL_DETAILS[panel];
    const state = statistics[panel];
    const projectName = projectNames[parseStatisticPanel(panel)?.projectId ?? ""] ?? "a project";
    return {
      title: state?.status === "ready" ? state.statistic.name : "Saved statistic",
      description: `Your saved statistic in ${projectName}`,
    };
  };

  const removePanel = (panel: DashboardPanelId) => {
    const next = selectedPanels.filter((item) => item !== panel);
    setSelectedPanels(next);
    persist(next);
  };

  const toggleDraftPanel = (panel: DashboardPanelId) => {
    setDraftPanels((current) =>
      current.includes(panel) ? current.filter((item) => item !== panel) : [...current, panel]
    );
  };

  const savePanelSelection = () => {
    setSelectedPanels(draftPanels);
    persist(draftPanels);
    setPanelPickerOpen(false);
  };

  const moveDraftPanel = (panel: DashboardPanelId, direction: -1 | 1) => {
    setDraftPanels((current) => {
      const from = current.indexOf(panel);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  const restoreDefaultLayout = () => {
    const defaults = [...DEFAULT_DASHBOARD_PANELS];
    setDraftPanels(defaults);
    setSelectedPanels(defaults);
    resetDashboardPanels();
    setLayoutSaveFailed(false);
    setPanelPickerOpen(false);
  };

  const moveSavedPanel = (panel: DashboardPanelId, destination: DashboardPanelId) => {
    setSelectedPanels((current) => {
      const fromIndex = current.indexOf(panel);
      const destinationIndex = current.indexOf(destination);
      if (fromIndex < 0 || destinationIndex < 0 || fromIndex === destinationIndex) return current;
      const next = [...current];
      next.splice(fromIndex, 1);
      // A removed item shifts a later destination left by one. Insert before
      // the panel it was dropped onto, matching the visual drop target.
      next.splice(fromIndex < destinationIndex ? destinationIndex - 1 : destinationIndex, 0, panel);
      persist(next);
      return next;
    });
  };

  const handlePanelDrop = (destination: DashboardPanelId, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const panelFromTransfer = event.dataTransfer.getData("text/plain") as DashboardPanelId;
    const panel = panelFromTransfer || draggedPanel;
    if (panel && selectedPanels.includes(panel)) moveSavedPanel(panel, destination);
    setDraggedPanel(null);
    setDragOverPanel(null);
  };

  return {
    selectedPanels,
    draftPanels,
    panelPickerOpen,
    arrangingPanels,
    draggedPanel,
    dragOverPanel,
    statistics,
    availableStatistics,
    layoutSaveFailed,
    setPanelPickerOpen,
    toggleArranging: () => setArrangingPanels((current) => !current),
    setDraggedPanel,
    setDragOverPanel,
    openPanelPicker,
    closePanelPicker: () => setPanelPickerOpen(false),
    panelDetail,
    removePanel,
    toggleDraftPanel,
    savePanelSelection,
    moveDraftPanel,
    restoreDefaultLayout,
    handlePanelDrop,
  };
}
