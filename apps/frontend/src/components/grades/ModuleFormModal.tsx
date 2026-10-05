import { useEffect, useState } from "react";
import type { GradeModule, ModuleType } from "@logbook/shared";
import Modal from "../Modal";
import { createGradeModule, updateGradeModule } from "../../api";
import { apiError } from "../../lib/gradeDisplay";

const inputCls =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500";

/** Semester 2's share is whatever Semester 1 leaves; blank stays blank. */
function complement(value: string): string {
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n)) return "";
  return String(Math.round((100 - n) * 100) / 100);
}

interface ModuleFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Edit this module; otherwise create a new one. */
  module?: GradeModule;
  defaultYear: number;
  onSaved: (module: GradeModule) => void;
}

export default function ModuleFormModal({ open, onClose, module, defaultYear, onSaved }: ModuleFormModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [type, setType] = useState<ModuleType>("SEMESTER");
  const [semester, setSemester] = useState<"1" | "2">("1");
  const [semester1, setSemester1] = useState("");
  const [semester2, setSemester2] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(module?.code ?? "");
    setName(module?.name ?? "");
    setYear(String(module?.academicYear ?? defaultYear));
    setType(module?.type ?? "SEMESTER");
    setSemester(module?.semester === 2 ? "2" : "1");
    // No default split: a full-year module's weighting is the student's to enter.
    const weight = module?.semester1Weight;
    setSemester1(weight === null || weight === undefined ? "" : String(weight));
    setSemester2(weight === null || weight === undefined ? "" : complement(String(weight)));
    setError(null);
  }, [open, module, defaultYear]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError("Enter the module code.");
    if (!name.trim()) return setError("Enter the module name.");
    const academicYear = Number(year);
    if (!Number.isInteger(academicYear)) return setError("Enter the academic year, such as 2026.");
    const s1 = Number(semester1);
    if (type === "FULL_YEAR" && (semester1.trim() === "" || !Number.isFinite(s1) || s1 < 0 || s1 > 100)) {
      return setError("Enter how much Semester 1 counts, from 0 to 100. There is no default split.");
    }

    const data = {
      code: code.trim(),
      name: name.trim(),
      academicYear,
      type,
      semester: type === "SEMESTER" ? (Number(semester) as 1 | 2) : null,
      semester1Weight: type === "FULL_YEAR" ? s1 : null,
    };
    setSaving(true);
    setError(null);
    try {
      onSaved(module ? await updateGradeModule(module.id, data) : await createGradeModule(data));
    } catch (err) {
      setError(apiError(err, "Could not save the module."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={module ? "Edit module" : "Add a module"}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Code</span>
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} placeholder="COMS3011A" />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">Name</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={255} placeholder="Software Design" />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Academic year</span>
          <input type="number" className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} min={2000} max={2100} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-600 mb-1">Module type</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              ["SEMESTER", "Semester module", "Runs in one semester. Its assessments make up 100%."],
              ["FULL_YEAR", "Full-year module", "Runs in both semesters, each counting for a share you set."],
            ] as const).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${
                  type === value ? "border-blue-200 bg-blue-50" : "border-slate-200"
                }`}
              >
                <input type="radio" name="module-type" className="mt-0.5" checked={type === value} onChange={() => setType(value)} />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{label}</span>
                  <span className="block text-[11px] text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {type === "SEMESTER" ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Semester</span>
            <select className={inputCls} value={semester} onChange={(e) => setSemester(e.target.value as "1" | "2")}>
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </label>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Semester 1 counts (%)</span>
                <input
                  type="number"
                  className={inputCls}
                  value={semester1}
                  min={0}
                  max={100}
                  step="any"
                  onChange={(e) => {
                    setSemester1(e.target.value);
                    setSemester2(complement(e.target.value));
                  }}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Semester 2 counts (%)</span>
                <input
                  type="number"
                  className={inputCls}
                  value={semester2}
                  min={0}
                  max={100}
                  step="any"
                  onChange={(e) => {
                    setSemester2(e.target.value);
                    setSemester1(complement(e.target.value));
                  }}
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              The two always add up to 100%. Use your module's actual split — it isn't always 50/50.
            </p>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-lg text-slate-600 hover:bg-slate-100 transition">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? "Saving..." : module ? "Save changes" : "Add module"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
