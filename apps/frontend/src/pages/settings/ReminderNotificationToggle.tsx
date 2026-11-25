import { useState } from "react";
import { fetchDueReminders } from "../../api";
import {
  disableReminderNotifications,
  enableReminderNotifications,
  notificationsSupported,
  reminderNotificationMode,
} from "../../lib/reminderNotifications";

/** Turns system notifications for newly due reminders on or off on this device. */
export default function ReminderNotificationToggle() {
  const [mode, setMode] = useState(reminderNotificationMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const enabled = mode !== null;

  if (!notificationsSupported()) {
    return <p className="text-sm text-slate-500">This browser can't show notifications.</p>;
  }

  const toggle = async () => {
    setMessage("");
    setBusy(true);
    if (enabled) {
      await disableReminderNotifications();
      setMode(null);
      setBusy(false);
      return;
    }
    try {
      const on = await enableReminderNotifications(await fetchDueReminders());
      setMode(reminderNotificationMode());
      if (!on) {
        setMessage(
          Notification.permission === "denied"
            ? "Notifications are blocked for this site. Allow them in your browser's site settings, then try again."
            : "Notifications weren't allowed."
        );
      }
    } catch {
      setMessage("Couldn't turn on notifications. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={toggle}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span>
          <span className="block text-sm font-medium text-slate-700">Notify me on this device</span>
          <span className="block text-sm text-slate-500">
            {mode === "in-app"
              ? "Shows a system notification when a reminder falls due, while the logbook is open in a tab. This browser can't receive notifications with the app closed."
              : "Shows a system notification when a reminder falls due, even when the logbook is closed."}
          </span>
        </span>
      </label>
      {message && <p className="text-sm text-amber-700">{message}</p>}
    </div>
  );
}
