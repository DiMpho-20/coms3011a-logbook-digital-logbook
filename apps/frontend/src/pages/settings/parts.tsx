import { useContext, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronRight } from "lucide-react";
import { QueryContext } from "./query";
import { SECTIONS, type SectionId } from "./sections";

/** A label with the part that matches the settings search highlighted. */
export function Highlight({ text }: { text: string }) {
  const query = useContext(QueryContext);
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-amber-100 text-inherit rounded px-1 -mx-1">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1"><Highlight text={label} /></label>
      {children}
    </div>
  );
}

/** The small heading over each group of options inside a section. */
export function GroupLabel({ text }: { text: string }) {
  return (
    <p className="text-sm text-slate-700 mb-3">
      <Highlight text={text} />
    </p>
  );
}

export function SettingsNav({
  active, onSelect, matches,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  matches: readonly SectionId[] | null;
}) {
  return (
    <nav className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible -mx-1 px-1 pb-1 lg:pb-0">
      {SECTIONS.map((section) => {
        // When a search is running, sections that cannot match are dimmed
        // rather than removed: a nav that changes length as you type is
        // harder to use than one that stays put.
        const dimmed = matches !== null && !matches.includes(section.id);
        const isActive = active === section.id;
        return (
          <button
            key={section.id}
            onClick={() => onSelect(section.id)}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition whitespace-nowrap text-left shrink-0 lg:w-full ${
              isActive
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-slate-600 hover:bg-white"
            } ${dimmed ? "opacity-50" : ""}`}
          >
            <section.icon className="h-4 w-4 shrink-0" />
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}

/** One row of the security checklist. */
export function SecurityCheck({
  done, label, detail, action,
}: {
  done: boolean;
  label: string;
  detail: string;
  action?: { text: string; onClick: () => void };
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
          done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {done ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{detail}</p>
      </div>
      {action && !done && (
        <button
          onClick={action.onClick}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0 inline-flex items-center gap-0.5"
        >
          {action.text} <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}
