import { materializeDueRecurringEntries } from "../utils/recurringEntries.js";

/** Check once on startup and then every minute while this backend is running. */
export function startRecurringEntryGeneration() {
  const run = () => materializeDueRecurringEntries().catch((error) => {
    console.error("Failed to generate recurring entries:", error);
  });
  run();
  return setInterval(run, 60_000);
}
