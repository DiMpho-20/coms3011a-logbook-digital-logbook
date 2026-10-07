import { useState } from "react";
import { Feather, X } from "lucide-react";
import { dailyEncouragement } from "../../lib/encouragement";
import { localDateKey } from "../../lib/utils";

const DISMISSED_KEY = "logbook-note-dismissed";

/**
 * A quiet line of encouragement, like a note in the margin of a logbook.
 * The message comes from a fixed list by date, so it costs no request.
 * Dismissing it hides it until tomorrow's note.
 */
export default function DailyNote() {
  const today = localDateKey(new Date());
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === today;
    } catch {
      return false;
    }
  });
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED_KEY, today);
    } catch {
      // Private browsing can refuse writes; it just shows again next visit.
    }
  };

  return (
    <aside
      aria-label="Today's note"
      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <Feather className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <p className="flex-1 font-serif italic text-[15px] leading-relaxed text-slate-700">{dailyEncouragement()}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide today's note"
        className="-m-1 rounded-lg p-1.5 text-slate-500 hover:bg-amber-100 hover:text-slate-700 transition"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
