import { Loader2 } from "lucide-react";

/** A one-line "still working" note, small enough to sit inside a panel. */
export function LoadingLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-xs text-slate-500" role="status">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {text}
    </div>
  );
}

/**
 * A failed request, in the server's own words where it gave any.
 *
 * Only errors from something the student just did are announced; panel load
 * errors are not, so a page of panels does not shout over each other.
 */
export function ErrorLine({ text, announce = true }: { text: string; announce?: boolean }) {
  return (
    <p role={announce ? "alert" : undefined} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{text}</p>
  );
}
