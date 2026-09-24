import { google, calendar_v3 } from "googleapis";
import prisma from "../prisma.js";

/**
 * OAuth credentials must be per request. Reusing one module-wide client lets
 * one user's access token overwrite another user's credentials.
 */
export function createGoogleCalendarClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

// Every event the logbook creates carries these private extended properties,
// which only this OAuth client can see. They let a sync find its own events
// again — to update or remove them — without storing Google event ids.
const SOURCE_KEY = "logbookSource";
const SOURCE_VALUE = "digital-logbook";
const ENTRY_KEY = "logbookEntryId";

type SyncableEntry = {
  id: string;
  projectId: string;
  dueDate: Date;
  project: { name: string };
  values: { value: string; field: { type: string } }[];
};

type OAuth2Client = ReturnType<typeof createGoogleCalendarClient>;

export type SyncResult = { created: number; updated: number; removed: number };

/** First non-empty text value, matching how the Open Work page names entries. */
function entrySummary(entry: SyncableEntry): string {
  const text = entry.values.find((v) => v.field.type === "TEXT" && v.value.trim());
  return text ? text.value.trim() : "Logbook entry";
}

/** Due dates are calendar days, so deadlines become all-day events. */
function eventFor(entry: SyncableEntry): calendar_v3.Schema$Event {
  const day = entry.dueDate.toISOString().slice(0, 10);
  const next = new Date(entry.dueDate);
  next.setUTCDate(next.getUTCDate() + 1);
  const appUrl = process.env.APP_URL || "http://localhost:5173";

  return {
    summary: `${entry.project.name} — ${entrySummary(entry)}`,
    description: `Due date from the Digital Logbook.\n${appUrl}/projects/${entry.projectId}`,
    start: { date: day },
    end: { date: next.toISOString().slice(0, 10) },
    extendedProperties: { private: { [SOURCE_KEY]: SOURCE_VALUE, [ENTRY_KEY]: entry.id } },
  };
}

async function listLogbookEvents(calendar: calendar_v3.Calendar): Promise<calendar_v3.Schema$Event[]> {
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId: "primary",
      privateExtendedProperty: [`${SOURCE_KEY}=${SOURCE_VALUE}`],
      maxResults: 2500,
      pageToken,
    });
    events.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return events;
}

/**
 * Mirror the user's open, dated entries into their primary Google Calendar.
 * Idempotent: re-running updates existing events instead of duplicating
 * them, and removes events whose entry was completed, undated or deleted.
 */
export async function syncDueDates(userId: string, auth: OAuth2Client): Promise<SyncResult> {
  const calendar = google.calendar({ version: "v3", auth });

  const entries = (await prisma.logbookEntry.findMany({
    where: { project: { userId }, status: "OPEN", dueDate: { not: null } },
    select: {
      id: true,
      projectId: true,
      dueDate: true,
      project: { select: { name: true } },
      values: { select: { value: true, field: { select: { type: true } } } },
    },
  })) as SyncableEntry[];

  const existing = new Map<string, calendar_v3.Schema$Event>();
  const orphans: string[] = [];
  for (const event of await listLogbookEvents(calendar)) {
    const entryId = event.extendedProperties?.private?.[ENTRY_KEY];
    if (!event.id) continue;
    if (entryId && !existing.has(entryId)) existing.set(entryId, event);
    else orphans.push(event.id);
  }

  const result: SyncResult = { created: 0, updated: 0, removed: 0 };

  for (const entry of entries) {
    const body = eventFor(entry);
    const current = existing.get(entry.id);
    if (current?.id) {
      existing.delete(entry.id);
      const unchanged =
        current.summary === body.summary &&
        current.description === body.description &&
        current.start?.date === body.start?.date;
      if (unchanged) continue;
      await calendar.events.patch({ calendarId: "primary", eventId: current.id, requestBody: body });
      result.updated++;
    } else {
      await calendar.events.insert({ calendarId: "primary", requestBody: body });
      result.created++;
    }
  }

  // Anything left belongs to an entry that is done, undated or deleted.
  const stale = [...[...existing.values()].map((e) => e.id!), ...orphans];
  for (const eventId of stale) {
    await calendar.events.delete({ calendarId: "primary", eventId }).catch((err) => {
      // Already gone on Google's side is the outcome we wanted anyway.
      if (err?.code !== 404 && err?.code !== 410) throw err;
    });
    result.removed++;
  }

  return result;
}
