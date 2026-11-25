import { useEffect, useState } from "react";
import {
  fetchAllEntries,
  fetchEntryFields,
  fetchGradeModules,
  fetchProjects,
  fetchReminders,
  type Entry,
  type EntryField,
  type GradeModule,
  type Project,
  type Reminder,
} from "../../api";

export interface DashboardData {
  projects: Project[];
  allEntries: Entry[];
  fieldsByProject: Record<string, EntryField[]>;
  /** Projects are in; the page can be shown. */
  loading: boolean;
  /** Entries are still arriving; panels that need them show placeholders. */
  entriesLoading: boolean;
  dataLoadFailed: boolean;
  loadFailures: number;
  truncated: boolean;
}

/**
 * Projects, then one request for every active project's entries.
 *
 * Two stages rather than one: the greeting, the project list and the counts
 * only need the projects, so the page is released as soon as they arrive and
 * the panels fill in behind it.
 */
export function useDashboardData(): DashboardData {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [fieldsByProject, setFieldsByProject] = useState<Record<string, EntryField[]>>({});
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(true);
  // Set when projects or entries couldn't be loaded, so an empty list is not taken for a new account.
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const [loadFailures, setLoadFailures] = useState(0);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProjects();
        if (cancelled) return;
        setProjects(data);
        // The greeting, the project list and the active-project count only
        // need this much. Release the page here.
        setLoading(false);

        // One request for every active project's entries, rather than two
        // per project. 500 is the endpoint's cap.
        const listing = await fetchAllEntries(
          { projectStatus: "ACTIVE", limit: 500 },
          { pendingProjectIds: data.filter((p) => p.status === "ACTIVE").map((p) => p.id) }
        );
        if (cancelled) return;
        setAllEntries(listing.entries);
        setFieldsByProject(listing.fieldsByProject);
        setTruncated(listing.truncated);

        // Most entries carry their own format snapshot, which is all
        // EntryCard needs. Only projects with an entry that has none —
        // legacy entries, and anything still queued offline — need the
        // live field list as a fallback, so only those are fetched.
        if (listing.projectsNeedingFields.length > 0) {
          const settled = await Promise.allSettled(
            listing.projectsNeedingFields.map(async (id) => ({ id, fields: await fetchEntryFields(id) }))
          );
          if (cancelled) return;
          const extra: Record<string, EntryField[]> = {};
          settled.forEach((r) => {
            if (r.status === "fulfilled") extra[r.value.id] = r.value.fields;
          });
          const failed = settled.filter((r) => r.status === "rejected");
          failed.forEach((r) => console.error("Failed to load a project's fields:", (r as PromiseRejectedResult).reason));
          setLoadFailures(failed.length);
          // Live fields beat an older snapshot for the fallback case.
          setFieldsByProject((prev) => ({ ...prev, ...extra }));
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        if (!cancelled) setDataLoadFailed(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setEntriesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    projects, allEntries, fieldsByProject,
    loading, entriesLoading, dataLoadFailed, loadFailures, truncated,
  };
}

export interface TodayData {
  modules: GradeModule[];
  reminders: Reminder[];
  todayLoading: boolean;
  modulesFailed: boolean;
  remindersFailed: boolean;
}

/** The student's modules and their own reminders, in parallel with the entries. */
export function useToday(): TodayData {
  const [modules, setModules] = useState<GradeModule[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [modulesFailed, setModulesFailed] = useState(false);
  const [remindersFailed, setRemindersFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchGradeModules(), fetchReminders("pending")]).then(([moduleResult, reminderResult]) => {
      if (cancelled) return;
      if (moduleResult.status === "fulfilled") setModules(moduleResult.value);
      else setModulesFailed(true);
      if (reminderResult.status === "fulfilled") setReminders(reminderResult.value);
      else setRemindersFailed(true);
      setTodayLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { modules, reminders, todayLoading, modulesFailed, remindersFailed };
}
