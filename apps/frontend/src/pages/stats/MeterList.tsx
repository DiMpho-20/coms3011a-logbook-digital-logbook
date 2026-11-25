/**
 * Label, a thin bar for its share of the largest value, and the value itself.
 * One row per item with hairline dividers; the bar is in the accent colour.
 */
export default function MeterList({ data, formatValue }: { data: { label: string; value: number }[]; formatValue: (v: number) => string }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <ul className="divide-y divide-slate-100">
      {data.map((d, i) => {
        const pct = Math.min((Math.abs(d.value) / max) * 100, 100);
        return (
          <li
            key={`${d.label}-${i}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.5rem]"
          >
            <span className="truncate text-sm text-slate-700" title={d.label}>{d.label}</span>
            <span className="text-right text-sm font-semibold tabular-nums text-slate-900 sm:order-3">{formatValue(d.value)}</span>
            <div
              className="col-span-2 h-1.5 rounded-full bg-slate-100 sm:order-2 sm:col-span-1"
              role="img"
              aria-label={`${d.label}: ${formatValue(d.value)}`}
            >
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${pct}%`, minWidth: d.value !== 0 ? "3px" : 0 }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
