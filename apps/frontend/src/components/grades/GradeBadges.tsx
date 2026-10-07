import { CheckCircle2, Circle, Hourglass, MinusCircle } from "lucide-react";
import type { AssessmentStatus } from "@logbook/shared";
import type { TargetStatus } from "../../lib/grades";
import { TARGET_STATUS_META } from "../../lib/gradeDisplay";
import StatusChip from "../StatusChip";

export function TargetStatusBadge({ status }: { status: TargetStatus }) {
  const meta = TARGET_STATUS_META[status];
  return (
    <StatusChip tone={meta.tone} icon={meta.icon} title={meta.description}>
      {meta.label}
    </StatusChip>
  );
}

/** Missed is shown apart from a mark of 0, and a passed date with no mark as awaiting. */
export function AssessmentStatusBadge({ status, awaiting = false }: { status: AssessmentStatus; awaiting?: boolean }) {
  if (status === "GRADED") return <StatusChip tone="success" icon={CheckCircle2}>Marked</StatusChip>;
  if (status === "MISSED") return <StatusChip tone="neutral" icon={MinusCircle}>Missed</StatusChip>;
  if (awaiting) return <StatusChip tone="caution" icon={Hourglass}>Awaiting mark</StatusChip>;
  return <StatusChip tone="neutral" icon={Circle}>Not marked yet</StatusChip>;
}
