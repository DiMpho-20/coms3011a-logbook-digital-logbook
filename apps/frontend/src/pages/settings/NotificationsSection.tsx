import { Link } from "react-router-dom";
import { Section } from "./parts";
import ReminderNotificationToggle from "./ReminderNotificationToggle";

/** The rules live on the server, with the reminders themselves. */
export default function NotificationsSection() {
  return (
    <Section title="Notifications">
      <p className="text-sm text-slate-600">
        Due-date, overdue, stalled-entry and daily logbook reminders are configured with your reminders.
      </p>
      <Link
        to="/reminders"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
      >
        Manage reminder rules
      </Link>
      <ReminderNotificationToggle />
    </Section>
  );
}
