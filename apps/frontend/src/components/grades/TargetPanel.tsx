import { useState } from "react";
import { Target } from "lucide-react";
import {
  REQUIRED_MARK_ASSUMPTION,
  formatPercent,
  formatPoints,
  formatRequired,
  formatWeight,
  type ModuleSummary,
} from "../../lib/grades";
import { TARGET_PRESETS, TARGET_STATUS_META } from "../../lib/gradeDisplay";
import { TargetStatusBadge } from "./GradeBadges";
import Card from "../Card";
import { chipToggle } from "../../lib/ui";

interface TargetPanelProps {
  summary: ModuleSummary;
  target: number | null;
  /** Saves the module's target; null clears it. */
  onChange: (target: number | null) => Promise<void>;
}

/** "What do I need?" — every figure here comes straight from the summary. */
export default function TargetPanel({ summary, target, onChange }: TargetPanelProps) {
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (value: number | null) => {
    setSaving(true);
    setError(null);
    try {
      await onChange(value);
      setCustom("");
    } catch {
      setError("Could not save the target.");
    } finally {
      setSaving(false);
    }
  };

  const applyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(custom);
    if (custom.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) {
      return setError("Enter a target from 0 to 100.");
    }
    choose(value);
  };

  const result = summary.target;

  return (
    <Card title="What do I need?" description="Pick a target to see the mark you need on the rest." icon={Target} bodyClassName="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {TARGET_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              disabled={saving}
              aria-pressed={target === preset.value}
              onClick={() => choose(preset.value)}
              className={chipToggle(target === preset.value)}
            >
              {preset.label}
            </button>
          ))}
          <form onSubmit={applyCustom} className="flex items-center gap-1">
            <input
              type="number"
              aria-label="Custom target"
              className="h-8 w-24 border border-slate-200 rounded-full px-3 text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Custom"
              min={0}
              max={100}
              step="any"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button type="submit" disabled={saving} className="px-2 py-1 text-xs font-medium text-blue-600 hover:underline">
              Set
            </button>
          </form>
          {target !== null && (
            <button type="button" disabled={saving} onClick={() => choose(null)} className="px-2 py-1 text-xs text-slate-500 hover:underline">
              Clear
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        {!result ? (
          <p className="text-sm text-slate-500">Finish setting up this module's weights to see what you need.</p>
        ) : result.status === "NO_TARGET" ? (
          <p className="text-sm text-slate-500">Choose a target to see what you need on the work that's left.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TargetStatusBadge status={result.status} />
              <span className="text-xs text-slate-500">{TARGET_STATUS_META[result.status].description}</span>
            </div>

            {summary.complete ? (
              <p className="text-sm text-slate-800">
                Everything is marked. Your final mark is <strong>{formatPercent(summary.securedPoints)}</strong>
                {result.status === "SECURED" ? `, which meets your ${formatWeight(result.value!)} target.` : `, short of your ${formatWeight(result.value!)} target.`}
              </p>
            ) : result.status === "SECURED" ? (
              <p className="text-sm text-slate-800">
                You've already secured {formatWeight(result.value!)}: with 0 on everything left you'd finish on{" "}
                {formatPercent(summary.securedPoints)}.
              </p>
            ) : result.status === "NOT_REACHABLE" ? (
              <p className="text-sm text-slate-800">
                {formatWeight(result.value!)} is no longer reachable. You still need {formatPoints(result.pointsNeeded!)}, but only{" "}
                {formatWeight(summary.remainingWeight)} of the module is left.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-800">
                  You need <strong className="text-base">{formatRequired(result.required!)}</strong> on the remaining{" "}
                  {formatWeight(summary.remainingWeight)} to finish with {formatWeight(result.value!)}.
                </p>
                <p className="text-xs text-slate-500">{REQUIRED_MARK_ASSUMPTION}</p>
              </>
            )}

            {!summary.complete && (
              <p className="text-xs text-slate-500">
                Highest possible final mark: <span className="font-medium text-slate-700">{formatPercent(summary.highestPossible)}</span>
              </p>
            )}
          </div>
        )}
    </Card>
  );
}
