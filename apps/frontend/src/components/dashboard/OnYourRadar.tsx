import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import Card from "../Card";
import Skeleton from "../Skeleton";
import Eyebrow from "./Eyebrow";
import type { RadarItem } from "../../lib/today";

/**
 * A few calm, factual nudges, each with the next useful step. Never a list
 * of problems: when there's nothing to act on, it simply says so.
 */
export default function OnYourRadar({ items, loading }: { items: RadarItem[]; loading: boolean }) {
  return (
    <Card title={<Eyebrow>On your radar</Eyebrow>} description="Things worth your attention" className="h-full" bodyClassName="">
      {loading ? (
        <div className="space-y-3 p-5" aria-busy="true">
          {[0, 1].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-start gap-3 px-5 py-5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-slate-800">You're all caught up.</p>
            <p className="text-sm text-slate-500">Nothing needs your attention right now.</p>
          </div>
        </div>
      ) : (
        <ul className="py-2">
          {items.map((item) => {
            // Shape as well as colour: a triangle for something to act on, a circle for something to know.
            const Icon = item.tone === "caution" ? AlertTriangle : Info;
            return (
              <li key={item.id} className="px-3">
                <Link
                  to={item.href}
                  className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-slate-50"
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${item.tone === "caution" ? "text-amber-600" : "text-slate-400"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800">{item.text}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:text-blue-700">
                      {item.action}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
