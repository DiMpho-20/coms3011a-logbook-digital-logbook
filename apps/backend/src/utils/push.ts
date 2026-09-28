import webpush from "web-push";
import prisma from "../prisma.js";
import { ENTRY_LABEL_INCLUDE, entryLabel, generateReminders } from "./reminders.js";

// Web push for reminders: the server tells a student's devices about a
// reminder as soon as it falls due, even when the logbook isn't open.
// Needs a VAPID key pair (npx web-push generate-vapid-keys); without one,
// push is simply off and reminders stay in-app only.

/** Beyond this many new reminders at once, send one summary instead. */
const MAX_SEPARATE = 3;

let configured: boolean | undefined;

/** The public key browsers subscribe with, or null when push isn't set up. */
export function vapidPublicKey(): string | null {
  return pushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null;
}

export function pushConfigured(): boolean {
  if (configured !== undefined) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return (configured = false);
  // Push services want a way to reach whoever runs the server.
  const appUrl = process.env.APP_URL;
  const subject =
    process.env.VAPID_SUBJECT ||
    (appUrl?.startsWith("https://") ? appUrl : "mailto:noreply@digital-logbook.app");
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("Invalid VAPID keys; push notifications are off:", error);
    configured = false;
  }
  return configured;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Mark the user's due reminders as already announced. Used when a device
 * subscribes, so it isn't greeted with every reminder that was due before.
 */
export async function markDueRemindersPushed(userId: string, now = new Date()): Promise<void> {
  await prisma.reminder.updateMany({
    where: { userId, status: "PENDING", remindAt: { lte: now }, pushedAt: null },
    data: { pushedAt: now },
  });
}

/** Send one message to every device the user subscribed; drops dead subscriptions. */
export async function pushToUser(userId: string, messages: PushMessage[]): Promise<number> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  for (const sub of subscriptions) {
    for (const message of messages) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(message),
          { TTL: 24 * 60 * 60 }
        );
        delivered++;
      } catch (error) {
        // 404/410: the browser unsubscribed or the app was uninstalled.
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
          break;
        }
        console.error("Failed to send push notification:", status ?? error);
      }
    }
  }
  return delivered;
}

/**
 * For every student with a subscribed device: apply their reminder rules,
 * then push each pending reminder that has fallen due and not been pushed.
 */
export async function pushDueReminders(now = new Date()): Promise<void> {
  if (!pushConfigured()) return;
  const users = await prisma.pushSubscription.findMany({ distinct: ["userId"], select: { userId: true } });

  for (const { userId } of users) {
    try {
      await generateReminders(userId, now);
      const due = await prisma.reminder.findMany({
        where: { userId, status: "PENDING", remindAt: { lte: now }, pushedAt: null },
        include: { entry: { include: ENTRY_LABEL_INCLUDE } },
        orderBy: { remindAt: "asc" },
      });
      if (due.length === 0) continue;

      // Claim them first, so a slow send is never repeated on the next run.
      await prisma.reminder.updateMany({
        where: { id: { in: due.map((r) => r.id) }, pushedAt: null },
        data: { pushedAt: now },
      });

      const messages: PushMessage[] =
        due.length > MAX_SEPARATE
          ? [{
              title: `${due.length} reminders are due`,
              body: `${due.slice(0, MAX_SEPARATE).map((r) => r.title).join(", ")}, …`,
              url: "/reminders",
              tag: "logbook-reminders",
            }]
          : due.map((r) => ({
              title: r.title,
              body: [r.entry ? `${r.entry.project.name}: ${entryLabel(r.entry)}` : null, r.note]
                .filter(Boolean)
                .join("\n"),
              url: "/reminders",
              tag: `reminder-${r.id}`,
            }));
      await pushToUser(userId, messages);
    } catch (error) {
      console.error(`Failed to push reminders for user ${userId}:`, error);
    }
  }
}
