import type { CustomStatistic } from "../../api";

/** What a statistic panel shows: the statistic, or why it can't be shown. */
export type StatisticState =
  | { status: "loading" }
  | { status: "ready"; statistic: CustomStatistic }
  | { status: "missing" }
  | { status: "failed" };

/** A statistic's number, without the decimals a percentage doesn't need. */
export function formatStatisticValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
