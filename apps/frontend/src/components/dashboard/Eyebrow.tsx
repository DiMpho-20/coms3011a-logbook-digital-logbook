import type { ReactNode } from "react";

/**
 * The dashboard's section label: small capitals, so the content underneath
 * carries the weight rather than the heading. Pass it as a Card title or put
 * it inside an h2; the text itself stays in sentence case for screen readers.
 */
export default function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</span>;
}
