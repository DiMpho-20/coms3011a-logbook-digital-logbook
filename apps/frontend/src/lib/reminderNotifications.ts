import {
  fetchPushPublicKey,
  removePushSubscription,
  savePushSubscription,
  type Reminder,
} from "../api";

// Device notifications for reminders. Where the browser supports web push
// and the server has it set up, the server pushes each reminder as it falls
// due, even with the logbook closed. Otherwise the open app notices newly
// due reminders when it checks the badge, and shows them itself.

const ENABLED_KEY = "logbook-reminder-notifications";
const SEEN_KEY = "logbook-reminder-notified-ids";

/** Stored under ENABLED_KEY: "push" (server pushes) or "true" (the open app notifies). */
const PUSH = "push";
const IN_APP = "true";

/** Beyond this many new reminders at once, show one summary instead. */
const MAX_SEPARATE = 3;

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** How this device gets reminder notifications, or null when they're off. */
export function reminderNotificationMode(): "push" | "in-app" | null {
  if (!notificationsSupported() || Notification.permission !== "granted") return null;
  try {
    const value = localStorage.getItem(ENABLED_KEY);
    return value === PUSH ? "push" : value === IN_APP ? "in-app" : null;
  } catch {
    return null;
  }
}

/** On only when the user turned it on here and the browser still allows it. */
export function reminderNotificationsEnabled(): boolean {
  return reminderNotificationMode() !== null;
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

async function serviceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
}

/** The VAPID public key in the form PushManager.subscribe wants. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Subscribe this device to server push; false when push isn't available. */
async function subscribeToPush(): Promise<boolean> {
  const registration = await serviceWorker();
  if (!registration?.pushManager) return false;
  const publicKey = await fetchPushPublicKey().catch(() => null);
  if (!publicKey) return false;
  try {
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    await savePushSubscription(subscription.toJSON());
    return true;
  } catch (error) {
    console.warn("Push subscription failed; using in-app notifications instead:", error);
    return false;
  }
}

/**
 * Ask the browser for permission and turn notifications on, by push where
 * possible. Reminders that are already due count as seen, so turning this on
 * doesn't set off a burst of old ones. Resolves to whether notifications are
 * now on.
 */
export async function enableReminderNotifications(alreadyDue: Reminder[]): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;
  saveSeen(alreadyDue.map((r) => r.id));
  localStorage.setItem(ENABLED_KEY, (await subscribeToPush()) ? PUSH : IN_APP);
  return true;
}

/** Turn notifications off on this device, and stop the server pushing to it. */
export async function disableReminderNotifications(): Promise<void> {
  const wasPush = reminderNotificationMode() === "push";
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Nothing to undo.
  }
  if (!wasPush) return;
  try {
    const subscription = await (await serviceWorker())?.pushManager?.getSubscription();
    if (subscription) {
      await removePushSubscription(subscription.endpoint).catch(() => {});
      await subscription.unsubscribe();
    }
  } catch {
    // The server drops the subscription itself once the browser rejects it.
  }
}

async function show(title: string, options: NotificationOptions): Promise<void> {
  // Mobile browsers only allow notifications through the service worker;
  // it also lets a click on the notification bring the app forward.
  const registration = await serviceWorker();
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
  // With push on, the server already announces them.
  if (reminderNotificationMode() !== "in-app") return [];
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
