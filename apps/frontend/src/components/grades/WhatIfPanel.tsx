import { useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import type { GradeModule } from "@logbook/shared";
import { computeModule, formatPercent, formatWeight, type ModuleSummary } from "../../lib/grades";

const QUICK_MARKS = [40, 50, 60, 70, 80];

interface WhatIfPanelProps {
  module: GradeModule;
  /** The real figures, used to decide what can be imagined. */
  summary: ModuleSummary;
}

/**
 * "What if?" — hypothetical marks for what is left. Projections are the
 * engine's own (computeModule with hypothetical marks), and nothing here is
 * ever saved.
 */
export default function WhatIfPanel({ module, summary }: WhatIfPanelProps) {
  const start = Math.round(summary.averageSoFar ?? 50);
  const [all, setAll] = useState(start);
  const [mode, setMode] = useState<"all" | "each">("all");
  const [each, setEach] = useState<Record<string, number>>({});

  const pending = summary.rows.filter((row) => row.source === "pending");
  const emptySections = summary.sections.filter((s) => s.assessmentCount === 0 && s.moduleWeight > 0);

  const disabledReason = !summary.setup.valid
    ? "Finish setting up this module's weights to try what-if marks."
    : summary.complete
      ? "Everything is marked, so there is nothing left to imagine."
      : null;

  const hypothetical = mode === "all" ? { all } : { all, byId: each };
  const projected = disabledReason ? null : computeModule(module, { hypothetical }).projection?.finalMark ?? null;
  const quickTable =
    !disabledReason && pending.length === 1 && emptySections.length === 0
      ? QUICK_MARKS.map((mark) => ({ mark, final: computeModule(module, { hypothetical: { all: mark } }).projection?.finalMark ?? null }))
      : null;

  const reset = () => {
    setAll(start);
    setEach({});
    setMode("all");
  };

  return (
    <section className="bg-white rounded-lg border border-dashed border-blue-200" aria-labelledby="what-if-heading">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-slate-400" />
        <h2 id="what-if-heading" className="text-sm font-semibold text-slate-900">What if?</h2>
        <span className="ml-auto px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-[11px] font-medium text-blue-700">
          Hypothetical — not saved
        </span>
      </div>
      <div className="p-4 space-y-4">
        {disabledReason ? (
          <p className="text-sm text-slate-500">{disabledReason}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="What-if mode">
              {([
                ["all", "Same mark on everything left"],
                ["each", "Set each assessment"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition ${
                    mode === value ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-slate-600">
                {mode === "all" ? "If I average" : "Anything not set below"}: <strong>{all}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={all}
                aria-label="Hypothetical mark on everything left"
                onChange={(e) => setAll(Number(e.target.value))}
                className="w-full"
              />
            </label>

            {mode === "each" && (
              <ul className="space-y-2">
                {pending.map((row) => (
                  <li key={row.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-slate-700 truncate">{row.name}</span>
                    <span className="text-[11px] text-slate-400">{formatWeight(row.effectiveWeight)} of module</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`What-if mark for ${row.name}`}
                      className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={each[row.id] ?? all}
                      onChange={(e) => {
                        const value = e.target.value;
                        setEach((current) => {
                          const next = { ...current };
                          if (value === "") delete next[row.id];
                          else next[row.id] = Number(value);
                          return next;
                        });
                      }}
                    />
                  </li>
                ))}
                {emptySections.map((section) => (
                  <li key={section.label} className="text-[11px] text-slate-500">
                    {section.label} has no assessments yet, so its {formatWeight(section.moduleWeight)} uses the slider mark.
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-end justify-between gap-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
              <div>
                <p className="text-[11px] text-blue-700">Projected final mark</p>
                <p className="text-xl font-bold text-blue-900">{projected === null ? "—" : formatPercent(projected)}</p>
              </div>
              <button type="button" onClick={reset} className="flex items-center gap-1 text-xs text-blue-700 hover:underline">
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>

            {quickTable && (
              <table className="w-full text-sm">
                <caption className="text-left text-[11px] text-slate-500 pb-1">
                  {pending[0].name}: what each mark would give you
                </caption>
                <thead>
                  <tr className="text-[11px] text-slate-500">
                    <th className="text-left font-medium py-1">{pending[0].name} mark</th>
                    <th className="text-right font-medium py-1">Projected final mark</th>
                  </tr>
                </thead>
                <tbody>
                  {quickTable.map(({ mark, final }) => (
                    <tr key={mark} className="border-t border-slate-100">
                      <td className="py-1 text-slate-700">{mark}%</td>
                      <td className="py-1 text-right font-medium text-slate-800">{final === null ? "—" : formatPercent(final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </section>
  );
}
