import app from "./app.js";
import { startDeletionPurge } from "./jobs/purgeDeletedAccounts.js";
import { startRecurringEntryGeneration } from "./jobs/recurringEntries.js";
import { startReminderPushes } from "./jobs/pushReminders.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  startDeletionPurge();
  startRecurringEntryGeneration();
  startReminderPushes();
});
