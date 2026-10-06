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

Navigation: a sidebar on the left (the menu button at the top on phones) has three groups: Today (Dashboard, Reminders, Calendar), Work (Projects, Entries, Open Work, Board, Statistics) and Academics (My Grades). Profile, Settings and Log out are in the account menu at the bottom of the sidebar. Pressing N anywhere opens a new entry on the last project used.

Dashboard (/dashboard): overview of recent entries, current projects, tags, activity, deadlines and charts. "Customize dashboard" chooses and rearranges panels, including saved statistics; "Restore" returns to the default layout. The layout is saved to the account, so it is the same on every device.

Projects (/projects): "New Project" creates a project with a name, tags and an entry format (the fields each entry has: text, number, date, yes/no, tags, checklist, link, reference and computed fields). Filter by status (active or archived) and by tag; switch between grid and list view. Open a project to see its detail page.

Project detail (/projects/<id>, reached by opening a project from Projects): shows total time, entry count and last entry; the Entry Format section, where fields can be added, renamed or removed, and its history link shows earlier versions of the format; the entries list; "New entry" (or "Add First Entry") opens the entry form. The entry form has the project's fields, a due date, a stopwatch for time spent, tags, and "Repeat" to make an entry recurring (daily, weekly or monthly). Each entry card has buttons to edit, delete, view version history (where an earlier version can be viewed and restored), archive, and stop a recurring entry's future occurrences. Automation Rules, also on this page, add or remove tags or set the status automatically when an entry is created or saved ("New Rule"). Projects can be edited, archived or deleted here.

Entries (/entries): every entry across projects as a timeline, with search, project and tag filters, All / This Week / Overdue tabs, newest or oldest first, an archived-entries filter, and saving the current filter combination.

Open Work (/open-work): unfinished entries and their due dates in one place.

Statistics (/stats): time per project, totals and grouping over custom number fields, charts, and custom expressions such as SUM({Hours}) / COUNT(), which can be saved as named statistics and added to the dashboard.

My Grades (/grades): track university modules and their marks. "Add module" creates a semester module (one semester, its assessments total 100%) or a full-year module (Semester 1 and Semester 2, each counting for a share the student enters; there is no default 50/50). Choose the academic year and filter by semester; an Upcoming strip lists dated assessments in the next 14 days. Opening a module shows Secured (points out of 100 already earned), Average on marked work, Marked and Remaining; its assessments with weights, marks (entered as a mark out of a maximum, such as 25 / 40, or as a percentage, or marked as missed, which counts as 0%), contributions in points and an optional due or test date; "What do I need?" to pick a target (Pass 50%, 60%, 70%, 75% or custom) and see the mark needed on the remaining work; "What if?" to try hypothetical marks without saving them; and "How is this calculated?" for the working. A dated assessment gets reminders 5 days and 2 days before unless "Remind me" is unticked on it. Target and What if switch on once each semester's assessment weights total 100%. The figures are an unofficial estimate.

Calendar (/calendar): entries by due date in a month view, "Today" jumps back to now. Google Calendar sync is here: connect a Google account, then sync to copy due dates into Google Calendar.

Board (/board): kanban view of entries by status.

Reminders (/reminders): create a reminder ("New reminder"), snooze one by a day or delete it, and set reminder rules: upcoming due dates (how many days before), overdue entries, stalled entries (days without progress), a daily logbook reminder at a chosen time, and upcoming tests and assessments (5 days and 2 days before a dated assessment in My Grades). Device notifications can be switched on in Settings under Reminders.

Profile (/profile): avatar, bio, degree, year and student number.

Settings (/settings): Account (display name, email, password, two-factor authentication with an authenticator app and recovery codes, account deletion), Appearance (light or dark theme), Reminders (device notifications), Logbook Preferences (default project, default entry view, sort order, week start, time format) and Data (export the logbook as JSON or CSV, import or restore a backup).

Entries made while offline are kept on the device and sync automatically when the connection returns; a banner at the top shows how many are waiting.`;

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
  const context = currentPath ? `\n\nThe student is currently on ${currentPath}.` : "";
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
