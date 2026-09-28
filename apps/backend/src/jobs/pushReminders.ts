import { pushConfigured, pushDueReminders } from "../utils/push.js";

/** Check every minute while this backend is running, if push is set up. */
export function startReminderPushes() {
  if (!pushConfigured()) {
    console.log("VAPID keys not set; reminder push notifications are off.");
    return undefined;
  }
  let running = false;
  const run = () => {
    // A slow run shouldn't overlap the next one and push the same reminders twice.
    if (running) return;
    running = true;
    pushDueReminders()
      .catch((error) => console.error("Failed to push reminders:", error))
      .finally(() => { running = false; });
  };
  run();
  return setInterval(run, 60_000);
}
