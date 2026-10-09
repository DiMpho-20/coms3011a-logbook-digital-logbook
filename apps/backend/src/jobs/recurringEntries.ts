import { materializeDueRecurringEntries } from "../utils/recurringEntries.js";

/** Check once on startup and then every minute while this backend is running. */
export function startRecurringEntryGeneration() {
  // A long catch-up can outlast the minute; don't start a second run over it.
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    materializeDueRecurringEntries()
      .catch((error) => {
        console.error("Failed to generate recurring entries:", error);
      })
      .finally(() => {
        running = false;
      });
  };
  run();
  return setInterval(run, 60_000);
}
