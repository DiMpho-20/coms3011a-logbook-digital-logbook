import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Shown at the right of the heading, e.g. a "View all" link. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Padding for the body; pass "" when the body manages its own (lists, tables). */
  bodyClassName?: string;
}

/**
 * The app's panel: white paper on the page, a hairline border, no shadow at
 * rest. A titled card is a landmark region named by its heading, so screen
 * reader users can jump between sections.
 */
export default function Card({ title, description, icon: Icon, action, children, className = "", bodyClassName = "p-5" }: CardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={`bg-white rounded-xl border border-slate-200 ${className}`}
    >
      {title && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h2 id={headingId} className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children !== undefined && <div className={bodyClassName}>{children}</div>}
    </section>
  );
}
