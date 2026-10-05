import type { ReactNode } from "react";
import type { AssessmentStatus } from "@logbook/shared";
import type { TargetStatus } from "../../lib/grades";
import { TARGET_STATUS_META, TONE_CLASSES, type Tone } from "../../lib/gradeDisplay";

export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function TargetStatusBadge({ status }: { status: TargetStatus }) {
  const meta = TARGET_STATUS_META[status];
  return <Badge tone={meta.tone} title={meta.description}>{meta.label}</Badge>;
}

/** Missed is shown apart from a mark of 0, and a passed date with no mark as awaiting. */
export function AssessmentStatusBadge({ status, awaiting = false }: { status: AssessmentStatus; awaiting?: boolean }) {
  if (status === "GRADED") return <Badge tone="emerald">Marked</Badge>;
  if (status === "MISSED") return <Badge tone="red">Missed</Badge>;
  if (awaiting) return <Badge tone="amber">Awaiting mark</Badge>;
  return <Badge tone="slate">Not marked yet</Badge>;
}
