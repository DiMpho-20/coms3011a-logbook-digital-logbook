import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Plus } from "lucide-react";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Skeleton from "../components/Skeleton";
import ErrorState from "../components/ErrorState";
import EmptyState from "../components/EmptyState";
import ModuleCard from "../components/grades/ModuleCard";
import ModuleFormModal from "../components/grades/ModuleFormModal";
import UpcomingAssessments from "../components/grades/UpcomingAssessments";
import { fetchGradeModules, type GradeModule } from "../api";
import { computeModule, type TargetStatus } from "../lib/grades";
import { button, chipToggle } from "../lib/ui";
import {
  TARGET_STATUS_META,
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
  // The engine runs once per module here; the cards and the summary share the result.
  const summaries = useMemo(
    () => new Map(modules.map((m) => [m.id, computeModule(m, { target: m.targetMark })])),
    [modules]
  );

  const statusCounts = new Map<TargetStatus, number>();
  for (const m of shown) {
    const status = summaries.get(m.id)?.target?.status;
    if (status && status !== "NO_TARGET") statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }
  const withTargets = [...statusCounts.values()].reduce((a, b) => a + b, 0);
  const statusLine = [...statusCounts.entries()]
    .map(([status, n]) => `${n} ${TARGET_STATUS_META[status].label.toLowerCase()}`)
    .join(" · ");

  // A normal action: the grades, not adding modules, lead the page.
  const addButton = (
    <button onClick={() => setAdding(true)} className={button("secondary")}>
      <Plus className="h-4 w-4" aria-hidden="true" /> Add module
    </button>
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="My Grades"
        subtitle="Where each module stands, and what the remaining work has to do."
        action={addButton}
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true" aria-label="Loading your modules">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={load} /></Card>
      ) : modules.length === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title="Add your first module"
            description="Add a module, then its assessments and their weights. You'll see what you've secured so far and what you need on the rest."
            action={addButton}
          />
        </Card>
      ) : (
        <>
          {/* What's coming owns the top; the counts beside it stay quiet. */}
          <UpcomingAssessments
            items={upcoming}
            summaries={summaries}
            aside={
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Modules</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {shown.length} <span className="font-normal text-slate-500">{year === "ALL" ? "across all years" : `in ${year}`}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Targets</dt>
                  <dd className="text-slate-700">
                    {withTargets === 0 ? (
                      <span className="text-slate-500">None set yet. Set one on a module to see what you need.</span>
                    ) : (
                      <>
                        <span className="font-semibold tabular-nums text-slate-900">{withTargets}</span> set
                        <span className="block text-xs text-slate-500">{statusLine}</span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
            }
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {years.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Academic year
                <select
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  value={String(year)}
                  onChange={(e) => setChosenYear(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  <option value="ALL">All years</option>
                </select>
              </label>
            )}
            <div role="tablist" aria-label="Semester" className="flex flex-wrap gap-1">
              {TERMS.map((t) => (
                <button
                  key={t.label}
                  role="tab"
                  aria-selected={term === t.value}
                  onClick={() => setTerm(t.value)}
                  className={chipToggle(term === t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {term !== "ALL" && <span className="text-xs text-slate-500">Full-year modules show under both semesters.</span>}
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState
                icon={GraduationCap}
                compact
                title={
                  term === "ALL"
                    ? year === "ALL" ? "No modules here" : `No modules here for ${year}`
                    : `No Semester ${term} modules${year === "ALL" ? "" : ` in ${year}`}`
                }
                description="Try another year or semester, or add a module."
                action={addButton}
              />
            </Card>
          ) : (
            <section aria-label="Modules" className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {shown.map((m) => <ModuleCard key={m.id} module={m} summary={summaries.get(m.id)!} />)}
            </section>
          )}

          <p className="text-xs text-slate-500">{UNOFFICIAL_NOTE}</p>
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
