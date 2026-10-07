import { formatPercent, formatSecured, formatWeight, type ModuleSummary } from "../../lib/grades";

const clamp = (value: number) => Math.min(100, Math.max(0, value));

interface GradeBarProps {
  summary: ModuleSummary;
  /** The module's target, drawn as a tick. */
  target?: number | null;
  /** A what-if final mark, drawn as a dashed section after what's secured. */
  projected?: number | null;
  size?: "sm" | "lg";
  /** Show the legend and target label underneath (the module page). */
  labelled?: boolean;
}

/**
 * Where a module stands, on one 0–100 bar: solid for points secured, the open
 * track for what can still be earned, and hatching for what no longer can.
 * Every width is a figure the grade engine already worked out; this only
 * draws them.
 */
export default function GradeBar({ summary, target = null, projected = null, size = "sm", labelled = false }: GradeBarProps) {
  const secured = clamp(summary.securedPoints);
  const open = clamp(Math.min(summary.remainingWeight, 100 - secured));
  const lost = clamp(100 - secured - open);
  const whatIf = projected !== null ? clamp(projected) - secured : 0;

  const description = [
    `Secured ${formatSecured(summary.securedPoints)}`,
    `${formatWeight(summary.remainingWeight)} still to be marked`,
    target !== null ? `target ${formatWeight(target)}` : null,
    projected !== null ? `what-if final mark ${formatPercent(projected)}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(secured * 10) / 10}
        aria-valuetext={description}
        aria-label="Marks secured toward the final mark"
        className={`relative w-full rounded-full bg-slate-100 ${size === "lg" ? "h-3.5" : "h-2"}`}
      >
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="bar-grow h-full rounded-full bg-blue-600" style={{ width: `${secured}%` }} />
          {whatIf > 0 && (
            <div
              className="absolute inset-y-0 border-y-2 border-r-2 border-dashed border-blue-400 bg-blue-50"
              style={{ left: `${secured}%`, width: `${whatIf}%` }}
            />
          )}
          {lost > 0 && <div className="bar-lost absolute inset-y-0 right-0" style={{ width: `${lost}%` }} />}
        </div>
        {target !== null && (
          <div
            className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-slate-700"
            style={{ left: `calc(${clamp(target)}% - 1px)` }}
            aria-hidden="true"
          />
        )}
      </div>
      {labelled && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" /> Secured</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-200" /> Still possible</span>
          {lost > 0 && <span className="inline-flex items-center gap-1.5"><span className="bar-lost h-2 w-2 rounded-full" /> Can't be earned</span>}
          {target !== null && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-slate-700" /> Target {formatWeight(target)}</span>}
        </div>
      )}
    </div>
  );
}
