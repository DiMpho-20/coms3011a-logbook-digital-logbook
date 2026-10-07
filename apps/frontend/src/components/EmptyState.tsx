import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** What this place is for, and what to do next. */
  description: string;
  /** One clear next step, when there is one. */
  action?: React.ReactNode;
  /** Less padding, for an empty section inside a page rather than an empty page. */
  compact?: boolean;
}

export default function EmptyState({ icon: Icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? "py-8" : "py-16"}`}>
      <div className="p-3 bg-slate-100 rounded-xl mb-4">
        <Icon className="h-6 w-6 text-slate-500" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      <p className="text-sm text-slate-500 mt-1 max-w-md">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
