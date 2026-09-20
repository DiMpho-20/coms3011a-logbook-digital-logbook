import { useState } from "react";

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  formatValue?: (value: number) => string;
}

const WIDTH = 480;
const HEIGHT = 160;
const PAD = { top: 16, right: 16, bottom: 26, left: 16 };

/** Single-series line/area chart with a hover crosshair and tooltip. */
export default function TrendChart({ data, formatValue = (v) => String(v) }: TrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) return null;

  const chartW = WIDTH - PAD.left - PAD.right;
  const chartH = HEIGHT - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => ({
    x: PAD.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: PAD.top + chartH - (d.value / maxVal) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${PAD.top + chartH} L ${points[0].x} ${PAD.top + chartH} Z`;

  const active = hovered !== null ? data[hovered] : null;
  const activePoint = hovered !== null ? points[hovered] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-[180px]"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + chartH * (1 - frac)}
            y2={PAD.top + chartH * (1 - frac)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}

        {/* Area + line */}
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Crosshair */}
        {activePoint && (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={PAD.top}
            y2={PAD.top + chartH}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Points + hit targets */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hovered === i ? 5 : 3.5}
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth="2"
            />
            <rect
              x={p.x - chartW / Math.max(data.length, 1) / 2}
              y={PAD.top}
              width={chartW / Math.max(data.length, 1)}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              tabIndex={0}
              aria-label={`${data[i].label}: ${formatValue(data[i].value)}`}
            />
          </g>
        ))}

        {/* Endpoint direct label */}
        <text
          x={points[points.length - 1].x}
          y={points[points.length - 1].y - 10}
          textAnchor="end"
          className="text-[10px] font-semibold fill-slate-700"
        >
          {formatValue(data[data.length - 1].value)}
        </text>

        {/* X-axis labels: first, middle, last to avoid crowding */}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx)
          .map((i) => (
            <text
              key={i}
              x={points[i].x}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="text-[10px] fill-slate-400"
            >
              {data[i].label}
            </text>
          ))}
      </svg>

      {active && activePoint && (
        <div
          className="absolute pointer-events-none bg-slate-900 text-white text-[11px] rounded-md px-2 py-1 -translate-x-1/2 -translate-y-full shadow-lg"
          style={{
            left: `${(activePoint.x / WIDTH) * 100}%`,
            top: `${(activePoint.y / HEIGHT) * 100}%`,
            marginTop: "-8px",
          }}
        >
          <div className="font-semibold tabular-nums">{formatValue(active.value)}</div>
          <div className="text-slate-300">{active.label}</div>
        </div>
      )}
    </div>
  );
}
