import type { ReactNode } from "react";

/** A white card with a heading, a line of context, and an optional action on the right. */
export default function Panel({ title, description, action, children, level = 2 }: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className="text-[15px] font-semibold text-slate-900">{title}</Heading>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
