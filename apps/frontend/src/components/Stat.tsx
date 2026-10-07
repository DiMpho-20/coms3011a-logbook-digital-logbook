import type { ReactNode } from "react";

/** A labelled figure. Numbers use tabular digits so columns of them line up. */
export default function Stat({
  label,
  value,
  hint,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums text-slate-900 ${size === "lg" ? "text-3xl tracking-tight" : "text-lg"}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
