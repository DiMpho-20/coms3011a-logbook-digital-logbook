import { Calculator } from "lucide-react";
import { REQUIRED_MARK_ASSUMPTION, type ModuleSummary } from "../../lib/grades";
import { UNOFFICIAL_NOTE } from "../../lib/gradeDisplay";

/** "How is this calculated?" — renders the engine's own working, line by line. */
export default function CalculationExplainer({ summary }: { summary: ModuleSummary }) {
  return (
    <details className="bg-white rounded-xl border border-slate-200 group">
      <summary className="px-5 py-4 flex items-center gap-2 cursor-pointer select-none text-[15px] font-semibold text-slate-900">
        <Calculator className="h-4 w-4 text-slate-400" />
        How is this calculated?
      </summary>
      <div className="px-5 pb-5 space-y-3">
        <p className="text-xs text-slate-500">
          Each mark is multiplied by its share of the final mark to give points. Secured points are out of 100.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {summary.explanation.map((line, i) => (
                <tr key={`${line.label}-${i}`} className="border-t border-slate-100 align-top">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-slate-700 whitespace-nowrap">{line.label}</th>
                  <td className="py-1.5 pr-3 text-slate-500">{line.working}</td>
                  <td className="py-1.5 text-right font-medium text-slate-800 whitespace-nowrap">{line.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          {REQUIRED_MARK_ASSUMPTION} Figures are rounded to one decimal place for display, so rounded lines may not add up exactly.
        </p>
        <p className="text-xs text-slate-500">{UNOFFICIAL_NOTE}</p>
      </div>
    </details>
  );
}
