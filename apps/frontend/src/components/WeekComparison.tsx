import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Entry } from "../api";
import { recentWeeks, summariseWeek, type WeekSummary } from "../lib/dashboardInsights";
import { formatDuration } from "../lib/utils";

const METRICS: { key: keyof Omit<WeekSummary, "topTag">; label: string; format: (v: number) => string }[] = [
  { key: "entries", label: "Entries", format: String },
  { key: "minutes", label: "Time logged", format: formatDuration },
  { key: "activeDays", label: "Active days", format: (v) => `${v} / 7` },
];

function Change({ from, to, format }: { from: number; to: number; format: (v: number) => string }) {
  const diff = to - from;
  if (diff === 0) {
    return <span className="inline-flex items-center gap-0.5 text-slate-400"><Minus className="h-3 w-3" />No change</span>;
  }
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  const pct = from > 0 ? ` (${diff > 0 ? "+" : ""}${Math.round((diff / from) * 100)}%)` : "";
  return (
    <span className={`inline-flex items-center gap-0.5 ${diff > 0 ? "text-emerald-600" : "text-red-600"}`}>
      <Icon className="h-3 w-3" />
      {diff > 0 ? "+" : "−"}{format(Math.abs(diff))}{pct}
    </span>
  );
}

/** Two weeks side by side, with how the second changed from the first. */
export default function WeekComparison({ entries }: { entries: Entry[] }) {
  const weeks = useMemo(() => recentWeeks(12), []);
  const [baseWeek, setBaseWeek] = useState(weeks[1].key);
  const [compareWeek, setCompareWeek] = useState(weeks[0].key);

  const base = useMemo(() => summariseWeek(entries, baseWeek), [entries, baseWeek]);
  const compare = useMemo(() => summariseWeek(entries, compareWeek), [entries, compareWeek]);

  const select = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="block min-w-0 flex-1">
      <span className="block text-[11px] font-medium text-slate-500 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Compare weeks</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">See how one week measures up against another</p>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {select("Compare", baseWeek, setBaseWeek)}
          {select("With", compareWeek, setCompareWeek)}
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] text-slate-400">
              <th className="font-medium pb-2"><span className="sr-only">Measure</span></th>
              <th className="font-medium pb-2 text-right">First</th>
              <th className="font-medium pb-2 text-right">Second</th>
              <th className="font-medium pb-2 text-right">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {METRICS.map((m) => (
              <tr key={m.key}>
                <th scope="row" className="py-2 text-left font-medium text-slate-700">{m.label}</th>
                <td className="py-2 text-right tabular-nums text-slate-600">{m.format(base[m.key])}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{m.format(compare[m.key])}</td>
                <td className="py-2 text-right tabular-nums">
                  <Change from={base[m.key]} to={compare[m.key]} format={m.key === "activeDays" ? String : m.format} />
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 text-left font-medium text-slate-700">Top tag</th>
              <td className="py-2 text-right text-slate-600">{base.topTag ?? "—"}</td>
              <td className="py-2 text-right font-semibold text-slate-900">{compare.topTag ?? "—"}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
