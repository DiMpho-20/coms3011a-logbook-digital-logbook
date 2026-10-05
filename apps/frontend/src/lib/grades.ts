import type { AssessmentSection, AssessmentStatus, ModuleType } from "@logbook/shared";

/**
 * My Grades (FEAT-009): the only place grade arithmetic happens. Every figure
 * on the grades pages, the What-if projection and the "How is this
 * calculated?" explanation all come out of computeModule, so they can never
 * disagree with one another.
 *
 * There are two levels of weighting and they never mix:
 *
 *   1. An assessment's weight is its share of its *section*. A section's
 *      assessment weights total 100.
 *   2. A section's weight is its share of the *module*. A semester module has
 *      one section worth 100; a full-year module has Semester 1 and Semester 2,
 *      split however the student says (Semester 2 gets 100 minus Semester 1).
 *
 * An assessment's effective weight — its share of the final mark — is the
 * product of the two: 40% of a Semester 1 worth 60% is 24% of the module.
 * Every module-wide total below is a sum of effective weights.
 *
 * Pure: no React, no network, no dates. Bad input is reported in
 * `setup.issues`, never thrown.
 */

export interface GradeAssessmentInput {
  id: string;
  name: string;
  /** 1 or 2 in a full-year module; null in a semester module. */
  section: AssessmentSection | null;
  /** Share of its section, 0–100. */
  weight: number;
  /** A mark is either obtained out of max, or a percentage — or not yet known. */
  markObtained: number | null;
  markMax: number | null;
  markPercent: number | null;
  /** Missed counts as 0% and as marked. */
  missed: boolean;
}

export interface GradeModuleInput {
  type: ModuleType;
  /** Full-year modules only: Semester 1's share of the final mark. Semester 2 has the rest. */
  semester1Weight: number | null;
  assessments: GradeAssessmentInput[];
}

export interface GradeOptions {
  /** The final mark the student is aiming for, 0–100. */
  target?: number | null;
  /**
   * What-if marks for assessments not yet marked. `byId` sets one assessment;
   * `all` covers every other remaining assessment, and a section with no
   * assessments yet. Marked and missed assessments are never overridden.
   */
  hypothetical?: { all?: number | null; byId?: Record<string, number> };
}

/** How far a section's weights may stray from 100 and still be complete (33.33 × 3). */
export const WEIGHT_TOLERANCE = 0.01;

/** Slack for comparing points and percentages, so float noise never flips a status. */
const EPSILON = 0.005;

/** Shown wherever a required mark is: the figure is an average, not a per-assessment promise. */
export const REQUIRED_MARK_ASSUMPTION =
  "This assumes you get the same mark on every remaining assessment.";

export type RowSource = "actual" | "missed" | "hypothetical" | "pending";

export interface AssessmentRow {
  id: string;
  name: string;
  section: AssessmentSection | null;
  status: AssessmentStatus;
  /** Share of its section, as entered. */
  weight: number;
  /** Share of the final module mark. */
  effectiveWeight: number;
  /** The real mark, 0 when missed, the what-if mark when hypothetical, else null. */
  percent: number | null;
  /** Points toward the final mark, or null while pending. */
  contribution: number | null;
  source: RowSource;
  /** Why this assessment's mark can't be used, if it can't. */
  problem: string | null;
}

export interface SectionSummary {
  section: AssessmentSection | null;
  label: string;
  /** Share of the final module mark. */
  moduleWeight: number;
  /** Sum of the section's assessment weights; 100 when complete. */
  weightTotal: number;
  /** 100 minus weightTotal; negative when over-allocated. */
  unassignedWeight: number;
  assessmentCount: number;
  /** True when the weights total 100, or the section has no assessments yet. */
  weightsComplete: boolean;
  /** How much of the section (0–100) has been marked. */
  markedWeight: number;
  /** Average on the section's marked work, or null when nothing is marked. */
  sectionMark: number | null;
  /** Points this section has secured toward the final mark. */
  securedPoints: number;
  /** Share of the final mark still to be marked in this section. */
  remainingWeight: number;
}

export type TargetStatus =
  | "SECURED"
  | "WITHIN_REACH"
  | "STRETCH"
  | "NOT_REACHABLE"
  | "NO_TARGET"
  | "NOT_ENOUGH_DATA";

export interface TargetResult {
  value: number | null;
  status: TargetStatus;
  /** Points still needed, never negative; null without a target. */
  pointsNeeded: number | null;
  /**
   * Average needed on everything remaining. Only given when it is a mark the
   * student could actually get (WITHIN_REACH, STRETCH, NOT_ENOUGH_DATA), so
   * the UI never shows a negative or above-100 requirement.
   */
  required: number | null;
}

export interface Projection {
  /** The final mark if the what-if marks came true; null while some remaining weight has none. */
  finalMark: number | null;
  /** Remaining weight with no what-if mark. */
  unfilledWeight: number;
}

/** One line of "How is this calculated?", already worded and rounded for display. */
export interface ExplanationLine {
  label: string;
  working: string;
  result: string;
}

export interface ModuleSummary {
  setup: { valid: boolean; issues: string[] };
  sections: SectionSummary[];
  rows: AssessmentRow[];
  /** Points secured toward the final mark, out of 100. */
  securedPoints: number;
  /** Share of the module marked so far. */
  markedWeight: number;
  /** Share of the module still to be marked. */
  remainingWeight: number;
  /** Secured points per marked weight, or null when nothing is marked. */
  averageSoFar: number | null;
  /** Secured points plus full marks on everything remaining. */
  highestPossible: number;
  /** Everything has been marked: securedPoints is the final mark. */
  complete: boolean;
  /** Null while the setup is invalid: a target would be calculated on the wrong weights. */
  target: TargetResult | null;
  /** Null without what-if marks, or while the setup is invalid. */
  projection: Projection | null;
  explanation: ExplanationLine[];
}

type MarkFields = Pick<GradeAssessmentInput, "markObtained" | "markMax" | "markPercent" | "missed">;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const present = (value: number | null | undefined) => value !== null && value !== undefined;
const isPercent = (value: unknown): value is number => isNumber(value) && value >= 0 && value <= 100;

/** Why a mark can't be used, or null when it can (or there is none yet). */
export function markProblem(mark: MarkFields): string | null {
  const hasFraction = present(mark.markObtained) || present(mark.markMax);
  const hasPercent = present(mark.markPercent);

  if (mark.missed) return hasFraction || hasPercent ? "is marked as missed but also has a mark" : null;
  if (hasFraction && hasPercent) return "has both a mark and a percentage; use one";
  if (hasPercent) return isPercent(mark.markPercent) ? null : "needs a percentage between 0 and 100";
  if (hasFraction) {
    if (!isNumber(mark.markObtained) || !isNumber(mark.markMax)) {
      return "needs both the mark obtained and the maximum mark";
    }
    if (mark.markMax <= 0) return "needs a maximum mark above 0";
    if (mark.markObtained < 0) return "cannot have a negative mark";
    if (mark.markObtained > mark.markMax) return "has a mark above the maximum";
  }
  return null;
}

/** 25 / 40 → 62.5; 62.5% → 62.5; missed → 0; no mark (or an unusable one) → null. */
export function markToPercent(mark: MarkFields): number | null {
  if (markProblem(mark)) return null;
  if (mark.missed) return 0;
  if (isNumber(mark.markPercent)) return mark.markPercent;
  if (isNumber(mark.markObtained) && isNumber(mark.markMax)) return (mark.markObtained / mark.markMax) * 100;
  return null;
}

export function assessmentStatus(mark: MarkFields): AssessmentStatus {
  if (mark.missed) return "MISSED";
  return markToPercent(mark) === null ? "PENDING" : "GRADED";
}

// ─── Display ─────────────────────────────────────────────────────────────
// Figures are calculated at full precision and rounded only here, so the UI
// never rounds (or calculates) anything itself.

/** To one decimal place, halves away from zero; the slack absorbs float noise like 1.45 → 14.4999…. */
export function roundToTenth(value: number): number {
  return (Math.sign(value) * Math.round(Math.abs(value) * 10 + 1e-6)) / 10;
}

/** Up to one decimal place, so following the advice can never leave the student just short. */
export function roundUpToTenth(value: number): number {
  return Math.ceil(value * 10 - 1e-6) / 10;
}

/** A plain number with at most two decimals and no trailing zeros: 40, 33.33, 12.5. */
function plainNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export const formatPercent = (value: number) => `${roundToTenth(value).toFixed(1)}%`;
export const formatPoints = (value: number) => `${roundToTenth(value).toFixed(1)} pts`;
export const formatRequired = (value: number) => `${roundUpToTenth(value).toFixed(1)}%`;
export const formatSecured = (value: number) => `${roundToTenth(value).toFixed(1)} / 100`;
/** Weights as the student entered them: "40%", "33.33%". */
export const formatWeight = (value: number) => `${plainNumber(value)}%`;

/** The mark as entered, with its conversion: "25 / 40 = 62.5%", "62.5%", "Missed", "—". */
export function formatMark(mark: MarkFields): string {
  if (mark.missed) return "Missed";
  const percent = markToPercent(mark);
  if (percent === null) return "—";
  if (isNumber(mark.markObtained) && isNumber(mark.markMax)) {
    return `${plainNumber(mark.markObtained)} / ${plainNumber(mark.markMax)} = ${formatPercent(percent)}`;
  }
  return formatPercent(percent);
}

// ─── Calculation ─────────────────────────────────────────────────────────

interface SectionShare {
  section: AssessmentSection | null;
  label: string;
  moduleWeight: number;
}

/** The module's sections and their share of the final mark. */
function sectionShares(module: GradeModuleInput, issues: string[]): SectionShare[] {
  if (module.type === "SEMESTER") return [{ section: null, label: "Module", moduleWeight: 100 }];

  let semester1 = module.semester1Weight;
  if (!isPercent(semester1)) {
    // No fallback split: guessing 50/50 is exactly the mistake to avoid.
    issues.push("Set how much Semester 1 counts towards the final mark (Semester 2 gets the rest).");
    semester1 = null;
  }
  return [
    { section: 1, label: "Semester 1", moduleWeight: semester1 ?? 0 },
    { section: 2, label: "Semester 2", moduleWeight: semester1 === null ? 0 : 100 - semester1 },
  ];
}

const assessmentName = (assessment: GradeAssessmentInput) => `"${assessment.name.trim() || "Untitled assessment"}"`;

function clampPercent(value: number | null | undefined): number | null {
  return isNumber(value) ? Math.min(100, Math.max(0, value)) : null;
}

/**
 * Everything the grades pages show about one module. Pass `target` for the
 * required mark and its status; pass `hypothetical` for a What-if projection
 * (and call again without it for the real figures: hypothetical rows are
 * marked as such but must not be shown as real marks).
 */
export function computeModule(module: GradeModuleInput, options: GradeOptions = {}): ModuleSummary {
  const issues: string[] = [];
  const shares = sectionShares(module, issues);
  const fullYear = module.type === "FULL_YEAR";

  // ── Pass 1: each assessment's real mark and effective weight ──
  const base = module.assessments.map((assessment) => {
    let share: SectionShare | undefined;
    if (fullYear) {
      share = shares.find((s) => s.section === assessment.section);
      if (!share) issues.push(`${assessmentName(assessment)} needs a semester (1 or 2).`);
    } else {
      share = shares[0];
      if (assessment.section !== null) {
        issues.push(`${assessmentName(assessment)} is in a semester, but this is a semester module.`);
      }
    }

    let weight = assessment.weight;
    if (!isPercent(weight)) {
      issues.push(`${assessmentName(assessment)} needs a weight between 0 and 100.`);
      weight = 0;
    }

    const problem = markProblem(assessment);
    if (problem) issues.push(`${assessmentName(assessment)} ${problem}.`);

    return {
      assessment,
      share,
      weight,
      effectiveWeight: ((share?.moduleWeight ?? 0) * weight) / 100,
      percent: markToPercent(assessment),
      problem,
    };
  });

  // ── Sections ──
  const sections: SectionSummary[] = shares.map((share) => {
    const members = base.filter((item) => item.share === share);
    const marked = members.filter((item) => item.percent !== null);
    const weightTotal = members.reduce((sum, item) => sum + item.weight, 0);
    const markedWeight = marked.reduce((sum, item) => sum + item.weight, 0);
    // The 1e-9 keeps float noise (100 - 99.99 is 0.0100000000000051) on the right side of the line.
    const weightsComplete = members.length === 0 || Math.abs(weightTotal - 100) <= WEIGHT_TOLERANCE + 1e-9;

    if (!weightsComplete) {
      const prefix = fullYear ? `${share.label} weights` : "Weights";
      const gap = 100 - weightTotal;
      issues.push(
        `${prefix} total ${formatWeight(weightTotal)} — ${formatWeight(Math.abs(gap))} ${gap > 0 ? "unassigned" : "too much"}.`
      );
    }

    return {
      section: share.section,
      label: share.label,
      moduleWeight: share.moduleWeight,
      weightTotal,
      unassignedWeight: 100 - weightTotal,
      assessmentCount: members.length,
      weightsComplete,
      markedWeight,
      sectionMark:
        markedWeight > EPSILON
          ? marked.reduce((sum, item) => sum + item.percent! * item.weight, 0) / markedWeight
          : null,
      securedPoints: marked.reduce((sum, item) => sum + (item.percent! * item.effectiveWeight) / 100, 0),
      // A section with nothing in it yet is still to come in full.
      remainingWeight:
        members.length === 0
          ? share.moduleWeight
          : members.filter((item) => item.percent === null).reduce((sum, item) => sum + item.effectiveWeight, 0),
    };
  });

  const target = options.target ?? null;
  if (target !== null && !isPercent(target)) issues.push("The target needs to be between 0 and 100.");

  const valid = issues.length === 0;

  // ── Pass 2: rows, with what-if marks filling the gaps when allowed ──
  const hypothetical = valid ? options.hypothetical : undefined;
  const hypotheticalAll = clampPercent(hypothetical?.all);
  const rows = base.map((item): AssessmentRow => {
    const { assessment } = item;
    const row = {
      id: assessment.id,
      name: assessment.name,
      section: assessment.section,
      status: assessmentStatus(assessment),
      weight: item.weight,
      effectiveWeight: item.effectiveWeight,
      problem: item.problem,
    };
    if (item.percent !== null) {
      return {
        ...row,
        percent: item.percent,
        contribution: (item.percent * item.effectiveWeight) / 100,
        source: assessment.missed ? "missed" : "actual",
      };
    }
    const whatIf = clampPercent(hypothetical?.byId?.[assessment.id]) ?? hypotheticalAll;
    if (hypothetical && whatIf !== null) {
      return { ...row, percent: whatIf, contribution: (whatIf * item.effectiveWeight) / 100, source: "hypothetical" };
    }
    return { ...row, percent: null, contribution: null, source: "pending" };
  });

  // ── Module totals ──
  const securedPoints = sections.reduce((sum, s) => sum + s.securedPoints, 0);
  const markedWeight = base.filter((item) => item.percent !== null).reduce((sum, item) => sum + item.effectiveWeight, 0);
  const remainingWeight = sections.reduce((sum, s) => sum + s.remainingWeight, 0);
  const averageSoFar = markedWeight > EPSILON ? (securedPoints / markedWeight) * 100 : null;
  const highestPossible = securedPoints + remainingWeight;

  // ── Target ──
  let targetResult: TargetResult | null = null;
  if (valid) {
    if (target === null) {
      targetResult = { value: null, status: "NO_TARGET", pointsNeeded: null, required: null };
    } else {
      const pointsNeeded = Math.max(0, target - securedPoints);
      const required = remainingWeight > EPSILON ? (pointsNeeded / remainingWeight) * 100 : null;
      // The order matters: the first that applies wins.
      let status: TargetStatus;
      if (securedPoints >= target - EPSILON) status = "SECURED";
      else if (required === null || required > 100 + EPSILON) status = "NOT_REACHABLE";
      else if (markedWeight <= EPSILON) status = "NOT_ENOUGH_DATA";
      else if (required <= averageSoFar! + EPSILON) status = "WITHIN_REACH";
      else status = "STRETCH";

      const achievable = status === "WITHIN_REACH" || status === "STRETCH" || status === "NOT_ENOUGH_DATA";
      targetResult = { value: target, status, pointsNeeded, required: achievable ? required : null };
    }
  }

  // ── What-if projection ──
  let projection: Projection | null = null;
  if (hypothetical) {
    let projected = securedPoints;
    let unfilledWeight = 0;
    for (const row of rows) {
      if (row.source === "hypothetical") projected += row.contribution!;
      else if (row.source === "pending") unfilledWeight += row.effectiveWeight;
    }
    for (const section of sections) {
      if (section.assessmentCount > 0) continue;
      if (hypotheticalAll === null) unfilledWeight += section.remainingWeight;
      else projected += (hypotheticalAll * section.remainingWeight) / 100;
    }
    projection = { finalMark: unfilledWeight > EPSILON ? null : projected, unfilledWeight };
  }

  const summary = {
    setup: { valid, issues },
    sections,
    rows,
    securedPoints,
    markedWeight,
    remainingWeight,
    averageSoFar,
    highestPossible,
    complete: valid && remainingWeight <= EPSILON,
    target: targetResult,
    projection,
  };
  return { ...summary, explanation: explain(module, summary) };
}

// ─── Explanation ─────────────────────────────────────────────────────────

function explain(module: GradeModuleInput, summary: Omit<ModuleSummary, "explanation">): ExplanationLine[] {
  const lines: ExplanationLine[] = [];
  const fullYear = module.type === "FULL_YEAR";
  const inputs = new Map(module.assessments.map((assessment) => [assessment.id, assessment]));

  for (const row of summary.rows) {
    if (row.contribution === null) continue;
    const input = inputs.get(row.id)!;
    const mark =
      row.source === "missed" ? "Missed (0%)"
      : row.source === "hypothetical" ? `${formatPercent(row.percent!)} (what-if)`
      : formatMark(input);
    const section = summary.sections.find((s) => s.section === row.section);
    const weighting = fullYear && section
      ? `${formatWeight(row.effectiveWeight)} of the module (${formatWeight(row.weight)} of ${section.label}, which counts ${formatWeight(section.moduleWeight)})`
      : `${formatWeight(row.weight)} of the module`;
    lines.push({ label: row.name, working: `${mark} × ${weighting}`, result: formatPoints(row.contribution) });
  }

  if (fullYear) {
    for (const section of summary.sections) {
      if (section.sectionMark === null) continue;
      lines.push({
        label: section.label,
        working: `${formatPercent(section.sectionMark)} average on the ${formatWeight(section.markedWeight)} of ${section.label} marked`,
        result: `${formatPoints(section.securedPoints)} secured`,
      });
    }
  }

  const real = summary.rows.filter((row) => row.source === "actual" || row.source === "missed");
  lines.push({
    label: "Secured",
    working: real.length > 0 ? real.map((row) => formatPoints(row.contribution!)).join(" + ") : "Nothing marked yet",
    result: formatSecured(summary.securedPoints),
  });

  if (summary.averageSoFar !== null) {
    lines.push({
      label: "Average on marked work",
      working: `${formatPoints(summary.securedPoints)} ÷ ${formatWeight(summary.markedWeight)} marked`,
      result: formatPercent(summary.averageSoFar),
    });
  }

  if (!summary.complete) {
    lines.push({
      label: "Highest possible final mark",
      working: `${formatPoints(summary.securedPoints)} + full marks on the ${formatWeight(summary.remainingWeight)} remaining`,
      result: formatPercent(summary.highestPossible),
    });
  }

  const target = summary.target;
  if (target && target.value !== null) {
    lines.push({
      label: `Still needed for ${formatWeight(target.value)}`,
      working: `${formatWeight(target.value)} target − ${formatPoints(summary.securedPoints)} secured`,
      result: formatPoints(target.pointsNeeded!),
    });
    if (target.required !== null) {
      lines.push({
        label: "Required on remaining work",
        working: `${formatPoints(target.pointsNeeded!)} ÷ ${formatWeight(summary.remainingWeight)} remaining`,
        result: formatRequired(target.required),
      });
    }
  }

  if (summary.projection && summary.projection.finalMark !== null) {
    lines.push({
      label: "Projected final mark (hypothetical)",
      working: `${formatPoints(summary.securedPoints)} secured + ${formatPoints(summary.projection.finalMark - summary.securedPoints)} what-if`,
      result: formatPercent(summary.projection.finalMark),
    });
  }

  return lines;
}
