import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Info, Radar } from "lucide-react";
import Card from "../Card";
import Skeleton from "../Skeleton";
import type { RadarItem } from "../../lib/today";

/**
 * A few calm, factual nudges, each with the next useful step. Never a list
 * of problems: when there's nothing to act on, it simply says so.
 */
export default function OnYourRadar({ items, loading }: { items: RadarItem[]; loading: boolean }) {
  return (
    <Card title="On your radar" description="Worth knowing or acting on now" icon={Radar} bodyClassName="">
      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-slate-600">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Nothing needs your attention right now.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={item.href} className="group flex items-start gap-3 px-5 py-3 transition duration-150 hover:bg-slate-50">
                <Info
                  className={`mt-0.5 h-4 w-4 shrink-0 ${item.tone === "caution" ? "text-amber-600" : "text-slate-400"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-sm text-slate-800">{item.text}</span>
                <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-blue-600 sm:inline-flex">
                  {item.action}
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
