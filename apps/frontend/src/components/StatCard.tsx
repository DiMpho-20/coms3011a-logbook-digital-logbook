import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: "blue" | "emerald" | "orange" | "purple" | "red" | "slate";
}

const colorMap = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  orange: "bg-amber-50 text-amber-600",
  purple: "bg-violet-50 text-violet-600",
  red: "bg-red-50 text-red-600",
  slate: "bg-slate-100 text-slate-500",
};

export default function StatCard({ icon: Icon, label, value, color = "blue" }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colorMap[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-lg font-bold text-slate-900">{value}</p>
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
