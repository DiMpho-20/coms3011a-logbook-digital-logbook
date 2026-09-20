import { useState } from "react";

export interface BarChartDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartDatum[];
  /** Format a value for its direct label, e.g. minutes -> "2h 30m". */
  formatValue?: (value: number) => string;
}

/** Horizontal bar chart: one hue, direct value labels, hover highlight. */
export default function BarChart({ data, formatValue = (v) => String(v) }: BarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = Math.min((Math.abs(d.value) / max) * 100, 100);
        return (
          <div key={`${d.label}-${i}`}>
            <div className="flex items-center justify-between gap-3 text-xs mb-1">
              <span
                className="font-medium text-slate-700 truncate"
                title={d.label}
              >
                {d.label}
              </span>
              <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                {formatValue(d.value)}
              </span>
            </div>
            <div
              className="h-3 rounded-full bg-slate-100"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${formatValue(d.value)}`}
            >
              <div
                className={`h-full rounded-r-full transition-colors ${
                  hovered === i ? "bg-blue-600" : "bg-blue-500"
                }`}
                style={{ width: `${pct}%`, minWidth: d.value !== 0 ? "3px" : 0 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
