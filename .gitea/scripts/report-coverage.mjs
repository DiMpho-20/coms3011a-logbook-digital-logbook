/**
 * Publishes coverage as commit statuses on Gitea.
 *
 * Gitea 1.24 has no built-in coverage display, so the number has to be pushed
 * to somewhere a person will actually look: the status line on the commit, and
 * the run's own summary page.
 *
 * Written in Node rather than as shell because jq and curl are not guaranteed
 * on a self-hosted runner, while Node is — setup-node has already run by the
 * time this executes.
 *
 * This never fails the build. Reporting a number is not worth turning a green
 * run red, so every failure path logs and exits 0.
 */
import { readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";

const server = process.env.GITHUB_SERVER_URL;
const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const runId = process.env.GITHUB_RUN_ID;
const token = process.env.GITEA_TOKEN;

const WORKSPACES = [
  { context: "coverage/backend", label: "Backend", summary: "apps/backend/coverage/coverage-summary.json" },
  { context: "coverage/frontend", label: "Frontend", summary: "apps/frontend/coverage/coverage-summary.json" },
];

/** Read one workspace's line totals, or null if the run did not produce them. */
function readLines({ summary }) {
  try {
    const { total } = JSON.parse(readFileSync(summary, "utf8"));
    return { covered: total.lines.covered, total: total.lines.total, pct: total.lines.pct };
  } catch (error) {
    console.log(`No coverage summary at ${summary}: ${error.message}`);
    return null;
  }
}

async function postStatus(context, description) {
  const url = `${server}/api/v1/repos/${repo}/statuses/${sha}`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `token ${token}` },
      body: JSON.stringify({
        state: "success",
        context,
        description,
        target_url: `${server}/${repo}/actions/runs/${runId}`,
      }),
    });
  } catch (error) {
    // fetch throws rather than returning a response when the host cannot be
    // reached at all — DNS, TLS, a runner with no route to the Gitea host.
    console.log(`${context}: could not reach ${url} — ${error.message}`);
    return;
  }

  if (res.ok) {
    console.log(`${context}: ${description} — published`);
    return;
  }

  // The likeliest cause is the runner's injected token lacking repo:status
  // scope. The response body says which, so print it rather than guessing.
  console.log(`${context}: POST ${url} returned ${res.status}`);
  try {
    console.log(await res.text());
  } catch (error) {
    console.log(`(could not read the response body: ${error.message})`);
  }
  console.log(
    "If this is a permissions error, create a repo secret with a token that " +
      "has write access and pass it to this step instead of the injected one."
  );
}

const measured = WORKSPACES.map((w) => ({ ...w, lines: readLines(w) })).filter((w) => w.lines);

if (measured.length === 0) {
  console.log("No coverage summaries found; nothing to report.");
  process.exit(0);
}

const covered = measured.reduce((sum, w) => sum + w.lines.covered, 0);
const total = measured.reduce((sum, w) => sum + w.lines.total, 0);
const combined = total === 0 ? 0 : Number(((covered / total) * 100).toFixed(2));

// A "combined" figure is only honest when both workspaces reported: with a
// single summary it would silently repeat that workspace's number (a red
// backend run once published ~78% as "combined"), so it is withheld unless
// the set is complete.
const complete = measured.length === WORKSPACES.length;

// The run summary renders on runners that support it and is ignored by those
// that do not, so it costs nothing to write.
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = measured
    .map((w) => `| ${w.label} | ${w.lines.covered} / ${w.lines.total} | ${w.lines.pct}% |`)
    .join("\n");
  const combinedRow = complete
    ? `\n| **Combined** | **${covered} / ${total}** | **${combined}%** |`
    : "";
  try {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Coverage (lines)\n\n| Workspace | Covered | % |\n|---|---|---|\n${rows}${combinedRow}\n\n`
    );
  } catch (error) {
    console.log(`Could not write the run summary: ${error.message}`);
  }
}

if (complete) {
  console.log(`Combined: ${covered}/${total} lines = ${combined}%`);
} else {
  console.log(
    `Combined not published: only ${measured.length} of ${WORKSPACES.length} workspaces reported.`
  );
}

if (!server || !repo || !sha) {
  console.log("Not running under Gitea Actions (server, repository or SHA missing); skipping statuses.");
  process.exit(0);
}

if (!token) {
  console.log("No token available to this step; skipping statuses. The table above is still in the log.");
  process.exit(0);
}

for (const w of measured) {
  await postStatus(w.context, `${w.lines.pct}% lines`);
}
// Combined is the figure the rubric is judged on, so it gets its own status
// rather than being left for a reader to work out from the other two — but
// only when both summaries are present, so the number on the commit always
// means what its name says.
if (complete) {
  await postStatus("coverage/combined", `${combined}% lines`);
}
