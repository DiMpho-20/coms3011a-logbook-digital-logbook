import { useId } from "react";
import { Link } from "react-router-dom";
import { Check, FolderPlus, GraduationCap, NotebookPen, Upload, type LucideIcon } from "lucide-react";
import { button } from "../../lib/ui";

interface Step {
  icon: LucideIcon;
  title: string;
  detail: string;
  done: boolean;
}

/**
 * The dashboard's first-use section: how a logbook gets going, in three
 * steps. It only arranges what the page already knows — whether there are
 * projects, entries and modules — and every action is an existing route.
 */
export default function GettingStarted({
  hasProjects,
  hasModules,
  logEntryHref,
}: {
  hasProjects: boolean;
  hasModules: boolean;
  /** Where "Log your first entry" goes: an existing project's new-entry form. */
  logEntryHref: string;
}) {
  const headingId = useId();
  const steps: Step[] = [
    { icon: FolderPlus, title: "Make a project.", detail: "One per module, or one per piece of work.", done: hasProjects },
    { icon: NotebookPen, title: "Log an entry.", detail: "What you did, how long it took.", done: false },
    { icon: GraduationCap, title: "Add your modules.", detail: "Only if you want to track marks.", done: hasModules },
  ];

  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      {hasProjects ? (
        <>
          <h2 id={headingId} className="text-lg font-semibold text-slate-900">Now log your first entry.</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Your project is ready. Write down what you did and how long it took — everything else on this page fills
            itself in as you write.
          </p>
        </>
      ) : (
        <>
          <h2 id={headingId} className="text-lg font-semibold text-slate-900">Start with one thing you did today.</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            A logbook is just a record of work, written as you go. You don't need to set anything up first — make a
            project to hold entries, then log what you did. Everything else on this page fills itself in as you write.
          </p>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {hasProjects ? (
          <Link to={logEntryHref} className={button("primary")}>
            <NotebookPen className="h-4 w-4" aria-hidden="true" /> Log your first entry
          </Link>
        ) : (
          <Link to="/projects" className={button("primary")}>
            <FolderPlus className="h-4 w-4" aria-hidden="true" /> Create your first project
          </Link>
        )}
        {/* The existing restore in Settings › Export / import. */}
        <Link to="/settings?section=export" className={button("secondary")}>
          <Upload className="h-4 w-4" aria-hidden="true" /> Import a backup
        </Link>
      </div>

      <ol className="mt-6 grid grid-cols-1 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="flex items-start gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${
                  step.done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
                aria-hidden="true"
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                  <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {step.title}
                  {step.done && <span className="text-xs font-normal text-emerald-700">Done</span>}
                </span>
                <span className="block text-xs text-slate-500">{step.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
