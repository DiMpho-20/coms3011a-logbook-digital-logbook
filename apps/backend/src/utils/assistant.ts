/**
 * In-app help assistant, backed by the Gemini API.
 *
 * The model is asked for structured JSON — an answer plus, optionally, one
 * page of the app to take the student to — so the frontend can offer a
 * "Take me there" button without parsing free text. The page is checked
 * against NAVIGABLE_PATHS, so the model can only ever send someone to a real
 * route.
 *
 * Only the conversation and the page the student is on are sent. No logbook
 * data leaves the server: the free Gemini tier may use prompts to improve
 * Google's models.
 */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Tried in order. A model that is overloaded or out of quota answers 429 or
 * 503, and the next one is tried rather than failing the student's question.
 * The lite models are the ones a free-tier key can reliably use.
 */
const DEFAULT_MODELS = ["gemini-flash-lite-latest", "gemini-3.1-flash-lite"];

const REQUEST_TIMEOUT_MS = 20_000;

/** Pages the assistant may send a student to. Mirrors the routes in App.tsx. */
export const NAVIGABLE_PATHS = [
  "/dashboard",
  "/projects",
  "/entries",
  "/open-work",
  "/stats",
  "/calendar",
  "/board",
  "/reminders",
  "/grades",
  "/profile",
  "/settings",
] as const;

export const APP_GUIDE = `You are the help assistant inside Digital Logbook, a web app where university students keep logbooks for their projects.
Your job is to help students find features and explain how to use them. Be brief: two to five short sentences or a few steps.
Name the exact page and button, as written below. Only answer questions about this app; for anything else, say politely that you can only help with Digital Logbook.
Never invent features. If something is not described here, say you are not sure and suggest the closest page.

Navigation: a sidebar on the left (the menu button at the top on phones) has four groups: Today (Dashboard, Reminders, Calendar), Work (Projects, Entries, Open Work, Board, Statistics), Academics (My Grades) and Personal (Profile, Settings). "Log out" is the button beside your name at the bottom of the sidebar. Pressing N anywhere opens a Quick entry form on the project last used.

Dashboard (/dashboard): a greeting with "New project"; today's note (hide it until tomorrow with its close button); Next up, what's happening soon, with "New reminder" and "View all upcoming"; On your radar, a few things worth attention; Modules at a glance from My Grades; and Your panels, the student's own panels. "Arrange panels" lets panels be dragged into a new order; "Customize" chooses panels, including saved statistics, and "Restore defaults" returns to the default layout. The layout is saved to the account, so it is the same on every device. A new account sees a getting-started guide instead, with "Create your first project", "Import a backup" and then "Log your first entry".

Projects (/projects): "New project" creates a project with a name, description, tags and an entry format (the fields each entry has: text, number, date, yes/no, tags, checklist, link, reference and computed fields). Search, choose Active, Archived or All, filter by tag, and switch between grid and list view. A project with no entry for two weeks shows as Quiet. Each project's "More actions" menu (the ••• button) has "Edit project", "Archive" or "Unarchive", and "Delete project". Click a project to open it.

Project detail (/projects/<id>, reached by opening a project from Projects): shows total time, entry count and last entry; the Entry Format section, where fields can be added, renamed or removed, and its history link shows earlier versions of the format; the entries list; "New entry" (or "Add First Entry") opens the entry form. The entry form has the project's fields, a due date, a stopwatch for time spent, tags, and "Repeat" to make an entry recurring (daily, weekly or monthly). Each entry card has buttons to edit, delete, view version history (where an earlier version can be viewed and restored), archive, and stop a recurring entry's future occurrences. Automation Rules, also on this page, add or remove tags or set the status automatically when an entry is created or saved ("New Rule"). Projects can be edited, archived or deleted here.

Entries (/entries): every entry, grouped by day, with this week's figures at the top. "Log an entry" starts a new one. Use the search box, the project and sort order (Newest first or Oldest first), and "Filters" for the rest: Show (All entries, This week, Overdue), Archive (active, include archived, archived only), a field filter once a project is chosen, and tags. Press "Search" to apply. "Save" keeps the current filter combination; "Clear filters" resets it. "View entry" opens an entry on its project.

Open Work (/open-work): everything unfinished, in three parts: Overdue, Coming up (the next two weeks, then Later) and No date yet. "Mark done" finishes an item; "Move date" changes its due date; "Add a due date" moves undated work into the plan.

Statistics (/stats): Time logged across all projects, then a project to look at. Breakdown totals a field ("Measure", "Calculate", optionally "Group by"); Over time plots entries or a number field per day, week or month. Your saved statistics lists the student's own calculations ("New statistic", edit, delete); "Try a calculation" works out an expression such as SUM({Hours}) / COUNT() and "Save as statistic" keeps it. Saved statistics can be added to the dashboard.

My Grades (/grades): track university modules and their marks. "Add module" creates a semester module (one semester, its assessments total 100%) or a full-year module (Semester 1 and Semester 2, each counting for a share the student enters; there is no default 50/50). Choose the academic year and filter by semester. Next assessment, at the top, shows the next dated assessment and what comes after it in the next 14 days. Each module card shows the average on marked work, what is secured toward the final mark, how much is marked and remaining, and what is needed for the target. Opening a module shows its assessments with weights, marks (entered as a mark out of a maximum, such as 25 / 40, or as a percentage, or marked as missed, which counts as 0%), contributions in points and an optional due or test date; "What do I need?" to pick a target (Pass 50%, 60%, 70%, 75% or custom) and see the mark needed on the remaining work; "What if?" to try hypothetical marks without saving them; and "How is this calculated?" for the working. A dated assessment gets reminders 5 days and 2 days before unless "Remind me" is unticked on it. Target and What if switch on once each semester's assessment weights total 100%. The figures are an unofficial estimate.

Calendar (/calendar): one project at a time as a month, with due dates and logged entries on their days (a list on phones). Click a day for its details; "Today" jumps back to now. Google Calendar sync is here: "Connect Google Calendar", then "Sync now" to copy open, unarchived due dates into Google Calendar; "Disconnect" removes the connection.

Board (/board): one project's entries in columns. "Group by" Status (open or done) or by one of the project's fields; entries without a value sit under Not grouped. Click a card to open the entry.

Reminders (/reminders): "New reminder" creates one. Three tabs: Needs attention, Upcoming, and Done & dismissed. "Complete", "Snooze 1 day" or "Dismiss" a reminder; "Reopen" brings one back; reminders you made yourself can be deleted. Each reminder says whether you set it or which rule made it. The Rules section switches automatic reminders on or off, then "Save rules": upcoming due dates (how many days before), overdue entries, stalled entries (days without progress), upcoming tests and assessments (5 days and 2 days before a dated assessment in My Grades), and a daily logbook reminder at a chosen time.

Profile (/profile): "Edit profile" changes the photo, bio, degree, year of study and student number. It also shows activity over the last twelve weeks, recent projects and the tags used most.

Settings (/settings): has a search box. Sections: Account (display name, a password reset email, account deletion), Appearance (light, dark or system theme, accent colour and density), Logbook (default project, default view, sort order, week start, time format), Notifications (device notifications for reminders), Security (two-factor authentication with an authenticator app and recovery codes), Data & privacy (what is kept where, and clearing local data) and Export / import (export the logbook as JSON or CSV, import or restore a backup).

Entries made while offline are kept on the device and sync automatically when the connection returns; a banner at the top shows how many are waiting.`;

/** An app path: a leading slash, then letters, digits, dashes, underscores and slashes. */
const SAFE_PATH = /^\/[A-Za-z0-9/_-]{0,199}$/;

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface AssistantReply {
  reply: string;
  navigateTo: string | null;
}

/** An answer from Gemini that is worth retrying on the next model. */
class RetryableModelError extends Error {}

function configuredModels(): string[] {
  const raw = process.env.GEMINI_MODEL?.trim();
  if (!raw) return DEFAULT_MODELS;
  return raw.split(",").map((m) => m.trim()).filter(Boolean);
}

export function assistantConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function buildRequest(messages: ChatMessage[], currentPath: string | undefined) {
  // The path comes from the browser, so only something shaped like an app
  // route is passed on to the model's instructions.
  const context = currentPath && SAFE_PATH.test(currentPath) ? `\n\nThe student is currently on ${currentPath}.` : "";
  return {
    systemInstruction: { parts: [{ text: APP_GUIDE + context }] },
    contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 600,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          reply: { type: "STRING", description: "The answer shown to the student." },
          navigateTo: {
            type: "STRING",
            description:
              "The one page that answers the question, if taking the student there would help; otherwise none.",
            // Gemini rejects an empty enum value, so "none" stands for no page.
            enum: ["none", ...NAVIGABLE_PATHS],
          },
        },
        required: ["reply", "navigateTo"],
      },
    },
  };
}

/** Reads the model's JSON, tolerating a navigateTo outside the allowlist. */
export function parseModelOutput(text: string): AssistantReply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Structured output failed; the raw text is still a usable answer.
    return { reply: text.trim(), navigateTo: null };
  }
  const obj = (parsed ?? {}) as { reply?: unknown; navigateTo?: unknown };
  const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
  const navigateTo =
    typeof obj.navigateTo === "string" &&
    (NAVIGABLE_PATHS as readonly string[]).includes(obj.navigateTo)
      ? obj.navigateTo
      : null;
  return { reply, navigateTo };
}

async function callModel(model: string, body: unknown, apiKey: string): Promise<AssistantReply> {
  const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const message = `Gemini ${model} answered ${res.status}: ${detail.slice(0, 300)}`;
    // 404 covers a model retired for this key, which the next model may not be.
    if ([404, 429, 500, 503].includes(res.status)) throw new RetryableModelError(message);
    throw new Error(message);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const answer = parseModelOutput(text);
  if (!answer.reply) throw new RetryableModelError(`Gemini ${model} returned no answer`);
  return answer;
}

/**
 * Answers the conversation's last question. Throws when no configured model
 * could answer; the caller turns that into a 502.
 */
export async function askAssistant(
  messages: ChatMessage[],
  currentPath?: string,
): Promise<AssistantReply> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const body = buildRequest(messages, currentPath);
  let lastError: unknown;
  for (const model of configuredModels()) {
    try {
      return await callModel(model, body, apiKey);
    } catch (error) {
      lastError = error;
      if (!(error instanceof RetryableModelError)) break;
    }
  }
  throw lastError;
}
