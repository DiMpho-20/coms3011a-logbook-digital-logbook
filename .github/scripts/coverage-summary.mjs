/**
 * Print both coverage summaries into the run's step summary.
 *
 * GitHub has no equivalent of the Gitea commit status that
 * .gitea/scripts/report-coverage.mjs publishes, so the visible figure is this
 * table: it appears on the run page without anyone downloading an artifact.
 *
 * A suite that did not run leaves no summary file, and a red run is exactly
 * when the table matters most — so a missing report is a row saying so rather
 * than an exception. The step that calls this also sets continue-on-error:
 * publishing a number must never turn a green run red.
 */
import { appendFile, readFile } from "node:fs/promises";

const REPORTS = [
  { suite: "Backend", path: "apps/backend/coverage/coverage-summary.json" },
  { suite: "Frontend", path: "apps/frontend/coverage/coverage-summary.json" },
];

const METRICS = ["lines", "statements", "functions", "branches"];

const row = (suite, cells) => `| ${suite} | ${cells.join(" | ")} |`;

const rows = [];

for (const { suite, path } of REPORTS) {
  try {
    const summary = JSON.parse(await readFile(path, "utf8"));
    const total = summary.total ?? {};
    const cells = METRICS.map((metric) => {
      const value = total[metric];
      return value ? `${value.pct}%` : "—";
    });
    const lines = total.lines;
    cells.push(lines ? `${lines.covered} / ${lines.total}` : "—");
    rows.push(row(suite, cells));
  } catch (error) {
    const reason = error?.code === "ENOENT" ? "no report produced" : String(error?.message ?? error);
    rows.push(row(suite, ["—", "—", "—", "—", reason]));
  }
}

const table = [
  "## Test coverage",
  "",
  "| Suite | Lines | Statements | Functions | Branches | Lines covered |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows,
  "",
].join("\n");

console.log(table);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  await appendFile(summaryFile, `${table}\n`);
}
