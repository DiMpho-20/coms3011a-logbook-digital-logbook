import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { TONE_STYLES, type Tone } from "../lib/ui";

/**
 * A small status label. Status is never colour alone: the text always says
 * what it means, and an icon can repeat it for quick scanning.
 */
export default function StatusChip({
  tone = "neutral",
  icon: Icon,
  children,
  title,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_STYLES[tone]}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}
