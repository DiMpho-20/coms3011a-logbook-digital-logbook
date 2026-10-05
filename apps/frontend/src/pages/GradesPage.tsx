import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Plus } from "lucide-react";
import PageHeader from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import ModuleCard from "../components/grades/ModuleCard";
import ModuleFormModal from "../components/grades/ModuleFormModal";
import UpcomingAssessments from "../components/grades/UpcomingAssessments";
import { fetchGradeModules, type GradeModule } from "../api";
import {
  UNOFFICIAL_NOTE,
  academicYears,
  apiError,
  defaultAcademicYear,
  moduleInTerm,
  moduleInYear,
  upcomingAssessments,
  type TermFilter,
  type YearFilter,
} from "../lib/gradeDisplay";

const TERMS: { value: TermFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: 1, label: "Semester 1" },
  { value: 2, label: "Semester 2" },
];

/** My Grades (FEAT-009): the student's modules for one academic year. */
export default function GradesPage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [modules, setModules] = useState<GradeModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Null until the student picks a year; until then (or if their pick no longer
  // has any modules) the default applies.
  const [chosenYear, setChosenYear] = useState<YearFilter | null>(null);
  const [term, setTerm] = useState<TermFilter>("ALL");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setModules(await fetchGradeModules());
    } catch (err) {
      setError(apiError(err, "Failed to load your modules"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only years the student actually has modules in; a new year appears once a module is added for it.
  const years = useMemo(() => academicYears(modules), [modules]);
  const year: YearFilter =
    chosenYear === "ALL" || (chosenYear !== null && years.includes(chosenYear))
      ? chosenYear
      : defaultAcademicYear(years, currentYear);
  const shown = modules.filter((m) => moduleInYear(m, year) && moduleInTerm(m, term));
  const upcoming = useMemo(() => upcomingAssessments(modules), [modules]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Grades"
        subtitle="Track your modules, what you've secured so far, and what you need on the rest."
        action={
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" /> Add module
          </button>
        }
      />

      {loading ? (
        <LoadingState message="Loading your modules..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <UpcomingAssessments items={upcoming} />

          <div className="flex flex-wrap items-center gap-3">
            {years.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Academic year
                <select
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  value={String(year)}
                  onChange={(e) => setChosenYear(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  <option value="ALL">All years</option>
                </select>
              </label>
            )}
            <div role="tablist" aria-label="Semester" className="flex gap-1">
              {TERMS.map((t) => (
                <button
                  key={t.label}
                  role="tab"
                  aria-selected={term === t.value}
                  onClick={() => setTerm(t.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition ${
                    term === t.value ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {term !== "ALL" && <span className="text-[11px] text-slate-400">Full-year modules show under both semesters.</span>}
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={modules.length === 0 ? "No modules yet" : year === "ALL" ? "No modules here" : `No modules here for ${year}`}
              description="Add a module, then its assessments and their weights, to see what you've secured and what you need."
              action={
                <button
                  onClick={() => setAdding(true)}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  Add module
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {shown.map((m) => <ModuleCard key={m.id} module={m} />)}
            </div>
          )}

          <p className="text-[11px] text-slate-400">{UNOFFICIAL_NOTE}</p>
        </>
      )}

      <ModuleFormModal
        open={adding}
        onClose={() => setAdding(false)}
        defaultYear={year === "ALL" ? currentYear : year}
        onSaved={(created) => {
          setAdding(false);
          navigate(`/grades/${created.id}`);
        }}
      />
    </div>
  );
}
