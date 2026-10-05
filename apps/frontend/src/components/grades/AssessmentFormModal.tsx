import { useEffect, useState } from "react";
import type { AssessmentDateKind, AssessmentSection, GradeAssessment, GradeModule } from "@logbook/shared";
import Modal from "../Modal";
import { createAssessment, updateAssessment } from "../../api";
import { formatMark, markProblem } from "../../lib/grades";
import { apiError } from "../../lib/gradeDisplay";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500";

type MarkMode = "none" | "fraction" | "percent" | "missed";

const MARK_MODES: { value: MarkMode; label: string }[] = [
  { value: "none", label: "Not marked yet" },
  { value: "fraction", label: "Mark out of" },
  { value: "percent", label: "Percentage" },
  { value: "missed", label: "Missed" },
];

/** A blank field is "no value"; anything else must be a number. */
const parse = (value: string) => (value.trim() === "" ? null : Number(value));

function modeOf(assessment?: GradeAssessment): MarkMode {
  if (!assessment) return "none";
  if (assessment.missed) return "missed";
  if (assessment.markPercent !== null) return "percent";
  if (assessment.markObtained !== null || assessment.markMax !== null) return "fraction";
  return "none";
}

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

interface AssessmentFormModalProps {
  open: boolean;
  onClose: () => void;
  module: GradeModule;
  /** Edit this assessment; otherwise add a new one. */
  assessment?: GradeAssessment;
  /** For a new assessment in a full-year module. */
  defaultSection?: AssessmentSection;
  onSaved: (assessment: GradeAssessment) => void;
}

export default function AssessmentFormModal({ open, onClose, module, assessment, defaultSection, onSaved }: AssessmentFormModalProps) {
  const fullYear = module.type === "FULL_YEAR";
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [section, setSection] = useState<"1" | "2">("1");
  const [mode, setMode] = useState<MarkMode>("none");
  const [obtained, setObtained] = useState("");
  const [max, setMax] = useState("");
  const [percent, setPercent] = useState("");
  const [date, setDate] = useState("");
  const [dateKind, setDateKind] = useState<AssessmentDateKind | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(assessment?.name ?? "");
    setWeight(text(assessment?.weight));
    setSection(String(assessment?.section ?? defaultSection ?? 1) as "1" | "2");
    setMode(modeOf(assessment));
    setObtained(text(assessment?.markObtained));
    setMax(text(assessment?.markMax));
    setPercent(text(assessment?.markPercent));
    setDate(assessment?.date ?? "");
    setDateKind(assessment?.dateKind ?? "");
    setError(null);
  }, [open, assessment, defaultSection]);

  const mark = {
    markObtained: mode === "fraction" ? parse(obtained) : null,
    markMax: mode === "fraction" ? parse(max) : null,
    markPercent: mode === "percent" ? parse(percent) : null,
    missed: mode === "missed",
  };
  const numbersOk = [mark.markObtained, mark.markMax, mark.markPercent].every((n) => n === null || Number.isFinite(n));
  const incomplete =
    (mode === "fraction" && (mark.markObtained === null || mark.markMax === null)) ||
    (mode === "percent" && mark.markPercent === null);
  const problem = numbersOk ? markProblem(mark) : "needs a number";
  // The conversion the student sees is the engine's own wording.
  const preview = mode !== "none" && !incomplete && !problem ? formatMark(mark) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the assessment a name.");
    const weightValue = parse(weight);
    if (weightValue === null || !Number.isFinite(weightValue) || weightValue < 0 || weightValue > 100) {
      return setError(fullYear ? "Enter its weight within its semester, from 0 to 100." : "Enter its weight, from 0 to 100.");
    }
    if (incomplete) return setError(mode === "percent" ? "Enter the percentage." : "Enter both the mark obtained and the maximum mark.");
    if (problem) return setError(`This mark ${problem}.`);
    if (date && !dateKind) return setError("Say whether the date is a due date or a test date.");

    const data = {
      name: name.trim(),
      weight: weightValue,
      section: fullYear ? (Number(section) as AssessmentSection) : null,
      ...mark,
      date: date || null,
      dateKind: date ? (dateKind as AssessmentDateKind) : null,
    };
    setSaving(true);
    setError(null);
    try {
      onSaved(assessment ? await updateAssessment(assessment.id, data) : await createAssessment(module.id, data));
    } catch (err) {
      setError(apiError(err, "Could not save the assessment."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={assessment ? "Edit assessment" : "Add an assessment"}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Name</span>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Midterm test" />
        </label>

        <div className={`grid gap-3 ${fullYear ? "grid-cols-2" : "grid-cols-1"}`}>
          {fullYear && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Semester</span>
              <select className={inputCls} value={section} onChange={(e) => setSection(e.target.value as "1" | "2")}>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">
              {fullYear ? "Weight within its semester (%)" : "Weight (%)"}
            </span>
            <input type="number" className={inputCls} value={weight} onChange={(e) => setWeight(e.target.value)} min={0} max={100} step="any" />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-600 mb-1">Mark</legend>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="How the mark is recorded">
            {MARK_MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                onClick={() => setMode(option.value)}
                className={`px-2.5 py-1 text-xs rounded-full border transition ${
                  mode === option.value ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {mode === "fraction" && (
            <div className="flex items-center gap-2">
              <input type="number" aria-label="Mark obtained" className={inputCls} value={obtained} onChange={(e) => setObtained(e.target.value)} min={0} step="any" placeholder="25" />
              <span className="text-sm text-slate-500">/</span>
              <input type="number" aria-label="Maximum mark" className={inputCls} value={max} onChange={(e) => setMax(e.target.value)} min={0} step="any" placeholder="40" />
            </div>
          )}
          {mode === "percent" && (
            <input type="number" aria-label="Percentage" className={inputCls} value={percent} onChange={(e) => setPercent(e.target.value)} min={0} max={100} step="any" placeholder="62.5" />
          )}
          {mode === "missed" && <p className="text-[11px] text-slate-500">A missed assessment counts as 0%.</p>}
          {preview && (
            <p className="text-sm text-slate-700" aria-live="polite">
              <span className="text-slate-500">Recorded as </span>
              <span className="font-semibold">{preview}</span>
            </p>
          )}
          {!incomplete && problem && mode !== "none" && <p className="text-xs text-amber-700">This mark {problem}.</p>}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Date (optional)</span>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">The date is a</span>
            <select
              className={inputCls}
              value={dateKind}
              disabled={!date}
              onChange={(e) => setDateKind(e.target.value as AssessmentDateKind | "")}
            >
              <option value="">Choose…</option>
              <option value="DUE">Due date</option>
              <option value="TEST">Test or exam date</option>
            </select>
          </label>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100 transition">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? "Saving..." : assessment ? "Save changes" : "Add assessment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
