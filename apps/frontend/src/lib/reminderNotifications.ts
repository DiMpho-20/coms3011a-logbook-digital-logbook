import type { Reminder } from "../api";

// Device notifications for reminders that fall due while the app is open
// (in any tab, even a background one). The server has no way to reach a
// closed app yet, so this only covers the time the logbook is open.

const ENABLED_KEY = "logbook-reminder-notifications";
const SEEN_KEY = "logbook-reminder-notified-ids";

/** Beyond this many new reminders at once, show one summary instead. */
const MAX_SEPARATE = 3;

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** On only when the user turned it on here and the browser still allows it. */
export function reminderNotificationsEnabled(): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

function loadSeen(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Iterable<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage full or blocked: worst case a reminder is announced twice.
  }
}

/**
 * Ask the browser for permission and turn notifications on. Reminders that
 * are already due count as seen, so turning this on doesn't set off a burst
 * of old ones. Resolves to whether notifications are now on.
 */
export async function enableReminderNotifications(alreadyDue: Reminder[]): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;
  saveSeen(alreadyDue.map((r) => r.id));
  localStorage.setItem(ENABLED_KEY, "true");
  return true;
}

export function disableReminderNotifications(): void {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Nothing to undo.
  }
}

async function show(title: string, options: NotificationOptions): Promise<void> {
  // Mobile browsers only allow notifications through the service worker;
  // it also lets a click on the notification bring the app forward.
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
  if (registration) {
    await registration.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
}

/**
 * Notify about due reminders that haven't been announced on this device yet.
 * Returns the reminders that were announced.
 */
export async function notifyNewDueReminders(due: Reminder[]): Promise<Reminder[]> {
  if (!reminderNotificationsEnabled()) return [];
  const seen = loadSeen();
  const fresh = due.filter((r) => !seen.has(r.id));
  // Keep only ids that are still due, so the list doesn't grow forever.
  saveSeen(due.map((r) => r.id));
  if (fresh.length === 0) return [];

  const base = { icon: "/favicon.svg", data: { url: "/reminders" } };
  try {
    if (fresh.length > MAX_SEPARATE) {
      await show(`${fresh.length} reminders are due`, {
        ...base,
        body: fresh.slice(0, MAX_SEPARATE).map((r) => r.title).join(", ") + ", …",
        tag: "logbook-reminders",
      });
    } else {
      for (const r of fresh) {
        const body = [r.entry ? `${r.entry.projectName}: ${r.entry.label}` : null, r.note]
          .filter(Boolean)
          .join("\n");
        await show(r.title, { ...base, body, tag: `reminder-${r.id}` });
      }
    }
  } catch {
    // The browser refused (for example permission revoked mid-session).
    return [];
  }
  return fresh;
}
