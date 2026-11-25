import { formatDuration } from "../../lib/utils";
import { LoadingLine } from "./Feedback";
import MeterList from "./MeterList";
import Panel from "./Panel";

/**
 * The page's headline: how much each active project has been worked on,
 * longest first. It reads a single batch request, so it costs nothing to
 * draw and needs no choices made on the page.
 */
export default function TimeLoggedPanel({
  times,
  failed,
}: {
  times: { label: string; value: number }[] | null;
  failed: boolean;
}) {
  return (
    <Panel title="Time logged" description="Across all projects">
      {failed ? (
        <p className="text-sm text-slate-500">Time per project couldn't be loaded just now. Reload the page to try again.</p>
      ) : times === null ? (
        <LoadingLine text="Loading…" />
      ) : times.every((p) => p.value === 0) ? (
        <p className="text-sm text-slate-500">No time logged yet — entries you add will show up here.</p>
      ) : (
        <MeterList data={times.filter((p) => p.value > 0)} formatValue={formatDuration} />
      )}
    </Panel>
  );
}
