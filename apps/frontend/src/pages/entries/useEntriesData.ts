import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchProjects,
  fetchEntryFields,
  fetchAllEntries,
  type Project,
  type EntryField,
  type Entry,
} from "../../api";
import { buildQuery, type AppliedFilters } from "./filters";

export interface EntryStats {
  total: number;
  weekCount: number;
  weekMinutes: number;
  overdueCount: number;
  streak: number;
}

export interface EntriesData {
  /** Active projects only: archived work is not in this listing's scope. */
  projects: Project[];
  /** Every active project's fields, for the title and the field filter. */
  fieldsByProject: Record<string, EntryField[]>;
  /** The newest format each project's listed entries were written in, as sent with the entries. */
  listingFields: Record<string, EntryField[]>;
  allEntries: Entry[];
  loading: boolean;
  entriesLoading: boolean;
  loadFailures: number;
  projectsFailed: boolean;
  entriesFailed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  /** The server's own counts for the stat cards. */
  stats: EntryStats;
  loadProjects: () => Promise<void>;
  reload: () => void;
  loadMore: () => Promise<void>;
}

const NO_STATS: EntryStats = { total: 0, weekCount: 0, weekMinutes: 0, overdueCount: 0, streak: 0 };

/**
 * The entries listing: projects and their fields, then one page of entries
 * per applied filter, with "load more" on top of the same query.
 *
 * `applied` is the only input that reloads the list; the draft filters stay
 * in the page until the student presses Search, so typing never fires a
 * request.
 */
export function useEntriesData(applied: AppliedFilters): EntriesData {
  const [projects, setProjects] = useState<Project[]>([]);
  const [fieldsByProject, setFieldsByProject] = useState<Record<string, EntryField[]>>({});
  const [listingFields, setListingFields] = useState<Record<string, EntryField[]>>({});
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [loadFailures, setLoadFailures] = useState(0);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [entriesFailed, setEntriesFailed] = useState(false);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [stats, setStats] = useState<EntryStats>(NO_STATS);

  const loadRunRef = useRef(0);

  // ── Load projects + fields (on mount, and again on "Try again") ───────
  const loadProjects = useCallback(async () => {
    setProjectsFailed(false);
    try {
      const all = await fetchProjects();
      const active = all.filter((p) => p.status === "ACTIVE");
      setProjects(active);
      setProjectsLoaded(true);
      setLoading(false);

      let failures = 0;
      const fieldResults = await Promise.all(
        active.map(async (p) => ({
          id: p.id,
          fields: await fetchEntryFields(p.id).catch(() => {
            failures += 1;
            return [] as EntryField[];
          }),
        }))
      );
      const map: Record<string, EntryField[]> = {};
      fieldResults.forEach((r) => { map[r.id] = r.fields; });
      setFieldsByProject(map);
      setLoadFailures(failures);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setProjectsFailed(true);
      setProjectsLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // ── Load entries when the applied snapshot changes ─────────────────────
  const loadAll = useCallback(async (snapshot: AppliedFilters) => {
    const run = ++loadRunRef.current;
    setEntriesLoading(true);
    setEntriesFailed(false);
    try {
      const listing = await fetchAllEntries(buildQuery(0, snapshot), {
        pendingProjectIds: projects.map((p) => p.id),
      });
      if (run !== loadRunRef.current) return;
      setAllEntries(listing.entries);
      setListingFields(listing.fieldsByProject);
      setHasMore(listing.truncated);
      if (listing.stats) setStats(listing.stats);
    } catch (err) {
      console.error("Failed to load entries:", err);
      if (run === loadRunRef.current) setEntriesFailed(true);
    } finally {
      if (run === loadRunRef.current) setEntriesLoading(false);
    }
  }, [projects]);

  // Re-fetch whenever the applied snapshot changes, and once the projects
  // have loaded (even when there are none, so the spinner clears). The
  // listing is scoped to the projects, so a project list that arrives
  // changes the query — which is why loadAll is a dependency and not a
  // suppressed one.
  useEffect(() => {
    if (!projectsLoaded) return;
    loadAll(applied);
  }, [applied, projectsLoaded, loadAll]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const listing = await fetchAllEntries(buildQuery(allEntries.length, applied), {
        pendingProjectIds: projects.map((p) => p.id),
      });
      setAllEntries((prev) => [...prev, ...listing.entries]);
      setListingFields((prev) => ({ ...listing.fieldsByProject, ...prev }));
      setHasMore(listing.truncated);
    } catch (err) {
      console.error("Failed to load more entries:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, allEntries.length, projects, applied]);

  const reload = useCallback(() => {
    loadAll(applied);
  }, [loadAll, applied]);

  return {
    projects,
    fieldsByProject,
    listingFields,
    allEntries,
    loading,
    entriesLoading,
    loadFailures,
    projectsFailed,
    entriesFailed,
    hasMore,
    loadingMore,
    stats,
    loadProjects,
    reload,
    loadMore,
  };
}
