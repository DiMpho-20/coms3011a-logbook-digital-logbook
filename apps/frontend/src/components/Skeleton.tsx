interface SkeletonProps {
  /** Tailwind width/height utilities, e.g. "h-4 w-24". */
  className?: string;
}

/**
 * A neutral placeholder for content that has been requested but hasn't
 * arrived. Prefer this over rendering a zero: "0 entries" and "0m" read as
 * facts, and a page that shows them before its data lands is telling the
 * reader something untrue.
 *
 * The pulse is a Tailwind animation, so the prefers-reduced-motion guard in
 * index.css neutralises it for viewers who ask for less motion — the
 * placeholder still shows, it just holds still.
 */
export default function Skeleton({ className = "h-4 w-20" }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded bg-slate-100 animate-pulse ${className}`}
    />
  );
}
