import type { BuiltInPanelId } from "../../lib/dashboardPreferences";

/** What the picker says about each panel, in the student's own terms. */
export const DASHBOARD_PANEL_DETAILS: Record<BuiltInPanelId, { title: string; description: string }> = {
  "entry-streak": { title: "Entry streak", description: "How many days in a row you've logged an entry" },
  "deadline-reminders": { title: "Deadline reminders", description: "Upcoming due dates from your entries" },
  activity: { title: "Activity", description: "A seven-day view of time logged" },
  "current-projects": { title: "Current projects", description: "Your active projects and their logged time" },
  "entry-progress": { title: "Progress over time", description: "Your running total of entries, week by week" },
  "monthly-entries": { title: "Entries per month", description: "How many entries you logged in each of the last six months" },
  "week-comparison": { title: "Compare weeks", description: "Put any two of the last twelve weeks side by side" },
  tags: { title: "Tags", description: "Tags used in your projects and entries" },
  "tag-ranking": { title: "Tag ranking", description: "Your most-used tags and how many entries use each" },
  "recent-entries": { title: "Recent entries", description: "Your latest logbook entries" },
};
