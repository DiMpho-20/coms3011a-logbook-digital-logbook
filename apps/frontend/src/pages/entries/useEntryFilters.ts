import { useCallback, useEffect, useState } from "react";
import { fetchTags, type ArchivedFilter } from "../../api";
import {
  loadSavedFilters,
  syncSavedFilters,
  saveFilter,
  deleteFilter,
  type SavedFilter,
} from "../../lib/savedFilters";
import type { AppliedFilters, FieldFilter } from "./filters";

export interface EntryFilters {
  // ── The draft the student is editing ──────────────────────────────────
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  projectId: string;
  /** Choosing a project also clears field filters, which belong to one project. */
  chooseProject: (id: string) => void;
  tab: "all" | "week" | "overdue";
  setTab: (tab: "all" | "week" | "overdue") => void;
  sort: "newest" | "oldest";
  setSort: (sort: "newest" | "oldest") => void;
  tags: string[];
  setTags: (tags: string[]) => void;
  archived: ArchivedFilter;
  setArchived: (archived: ArchivedFilter) => void;
  fieldFilters: FieldFilter[];
  availableTags: string[];

  // ── The panel behind the Filters button ───────────────────────────────
  showFilters: boolean;
  toggleFilters: () => void;
  showFilterPopover: boolean;
  toggleFilterPopover: () => void;
  closeFilterPopover: () => void;
  newFilterFieldId: string;
  chooseFilterField: (id: string) => void;
  newFilterOp: string;
  setNewFilterOp: (op: string) => void;
  newFilterValue: string;
  setNewFilterValue: (value: string) => void;

  // ── What the list is actually showing ─────────────────────────────────
  applied: AppliedFilters;
  /** Any draft filter — the "Clear filters" row appears for these. */
  filtersActive: boolean;
  /** Filters behind the button, counted for its badge. */
  advancedCount: number;
  /** Any applied filter — used to tell "nothing yet" from "nothing matches". */
  appliedFiltersActive: boolean;

  // ── Saved filters ─────────────────────────────────────────────────────
  savedFilters: SavedFilter[];
  activeFilterId: string | null;
  showSaveInput: boolean;
  toggleSaveInput: () => void;
  setShowSaveInput: (show: boolean) => void;
  filterName: string;
  setFilterName: (name: string) => void;

  // ── Actions ───────────────────────────────────────────────────────────
  applySearch: () => void;
  clearFilters: () => void;
  applySavedFilter: (filter: SavedFilter) => void;
  markManualChange: () => void;
  handleSaveFilter: () => Promise<void>;
  handleDeleteFilter: (id: string) => Promise<void>;
  addFieldFilter: () => void;
  removeFieldFilter: (index: number) => void;
}

/**
 * Everything the entries page filters by.
 *
 * Two copies on purpose: the draft, which the student edits freely, and the
 * applied snapshot, which is what the listing was actually fetched with.
 * Search and Enter move one to the other, so typing never fires a request
 * and the list never claims to be filtered by something it isn't.
 */
export function useEntryFilters(): EntryFilters {
  const [showFilters, setShowFilters] = useState(false);
  const [projectId, setProjectId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<"all" | "week" | "overdue">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [tags, setTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [archived, setArchived] = useState<ArchivedFilter>("exclude");
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);

  // Applied snapshot — only updated when the user clicks Search (or presses Enter).
  const [applied, setApplied] = useState<AppliedFilters>({
    search: "",
    projectId: "all",
    tab: "all",
    sort: "newest",
    tags: [],
    archived: "exclude",
    fieldFilters: [],
  });

  // Field filter popover state
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [newFilterFieldId, setNewFilterFieldId] = useState("");
  const [newFilterOp, setNewFilterOp] = useState("");
  const [newFilterValue, setNewFilterValue] = useState("");

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [filterName, setFilterName] = useState("");

  useEffect(() => {
    // The cached copy at once, then the account's list (which also uploads
    // any filter saved only on this device).
    setSavedFilters(loadSavedFilters());
    syncSavedFilters().then(setSavedFilters).catch(() => {});
  }, []);

  useEffect(() => {
    fetchTags().then((t) => setAvailableTags(t.map((tag) => tag.name))).catch(() => {});
  }, []);

  const markManualChange = useCallback(() => setActiveFilterId(null), []);

  const chooseProject = (id: string) => {
    markManualChange();
    setProjectId(id);
    setFieldFilters([]);
  };

  const chooseFilterField = (id: string) => {
    setNewFilterFieldId(id);
    setNewFilterOp("");
    setNewFilterValue("");
  };

  const applySearch = () => {
    setApplied({
      search: searchQuery,
      projectId,
      tab,
      sort,
      tags,
      archived,
      fieldFilters,
    });
  };

  const filtersActive =
    searchQuery.trim() !== "" ||
    projectId !== "all" ||
    tab !== "all" ||
    tags.length > 0 ||
    fieldFilters.length > 0;

  // Filters that live behind the "Filters" button, counted for its badge.
  const advancedCount =
    (tab !== "all" ? 1 : 0) + (archived !== "exclude" ? 1 : 0) + tags.length + fieldFilters.length;
  const appliedFiltersActive =
    applied.search.trim() !== "" ||
    applied.projectId !== "all" ||
    applied.tab !== "all" ||
    applied.tags.length > 0 ||
    applied.archived !== "exclude" ||
    applied.fieldFilters.length > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setProjectId("all");
    setTab("all");
    setTags([]);
    setFieldFilters([]);
    setArchived("exclude");
    setActiveFilterId(null);
    setApplied((prev) => ({
      ...prev,
      search: "",
      projectId: "all",
      tab: "all",
      tags: [],
      archived: "exclude",
      fieldFilters: [],
    }));
  };

  const applySavedFilter = (f: SavedFilter) => {
    setSearchQuery(f.searchQuery);
    setProjectId(f.filterProjectId);
    setTab(f.filterTab);
    setSort(f.sortOrder);
    setTags(f.selectedTags ?? []);
    setArchived((f.archivedFilter ?? "exclude") as ArchivedFilter);
    setFieldFilters(f.fieldFilters ?? []);
    setActiveFilterId(f.id);
    setShowSaveInput(false);
    // Saved filters apply immediately.
    setApplied({
      search: f.searchQuery,
      projectId: f.filterProjectId,
      tab: f.filterTab,
      sort: f.sortOrder,
      tags: f.selectedTags ?? [],
      archived: (f.archivedFilter ?? "exclude") as ArchivedFilter,
      fieldFilters: f.fieldFilters ?? [],
    });
  };

  const handleSaveFilter = async () => {
    if (!filterName.trim()) return;
    try {
      setSavedFilters(
        await saveFilter(filterName, {
          searchQuery,
          filterProjectId: projectId,
          filterTab: tab,
          sortOrder: sort,
          selectedTags: tags,
          archivedFilter: archived,
          fieldFilters,
        })
      );
      setFilterName("");
      setShowSaveInput(false);
    } catch (err) {
      console.error("Failed to save filter:", err);
    }
  };

  const handleDeleteFilter = async (id: string) => {
    try {
      setSavedFilters(await deleteFilter(id));
      if (activeFilterId === id) setActiveFilterId(null);
    } catch (err) {
      console.error("Failed to delete filter:", err);
    }
  };

  const addFieldFilter = () => {
    if (!newFilterFieldId || !newFilterOp) return;
    const value = newFilterOp === "is_true" || newFilterOp === "is_false" ? "" : newFilterValue;
    setFieldFilters((prev) => [...prev, { fieldId: newFilterFieldId, op: newFilterOp, value }]);
    setNewFilterFieldId("");
    setNewFilterOp("");
    setNewFilterValue("");
    setShowFilterPopover(false);
    markManualChange();
  };

  const removeFieldFilter = (index: number) => {
    setFieldFilters((prev) => prev.filter((_, i) => i !== index));
    markManualChange();
  };

  return {
    searchQuery,
    setSearchQuery,
    projectId,
    chooseProject,
    tab,
    setTab,
    sort,
    setSort,
    tags,
    setTags,
    archived,
    setArchived,
    fieldFilters,
    availableTags,
    showFilters,
    toggleFilters: () => setShowFilters((v) => !v),
    showFilterPopover,
    toggleFilterPopover: () => setShowFilterPopover((v) => !v),
    closeFilterPopover: () => setShowFilterPopover(false),
    newFilterFieldId,
    chooseFilterField,
    newFilterOp,
    setNewFilterOp,
    newFilterValue,
    setNewFilterValue,
    applied,
    filtersActive,
    advancedCount,
    appliedFiltersActive,
    savedFilters,
    activeFilterId,
    showSaveInput,
    toggleSaveInput: () => setShowSaveInput((v) => !v),
    setShowSaveInput,
    filterName,
    setFilterName,
    applySearch,
    clearFilters,
    applySavedFilter,
    markManualChange,
    handleSaveFilter,
    handleDeleteFilter,
    addFieldFilter,
    removeFieldFilter,
  };
}
