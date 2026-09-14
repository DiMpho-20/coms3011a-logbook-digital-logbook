# User Feedback

This page documents the formal user feedback process we use to improve
the Digital Logbook. Feedback is collected through a standardised
instrument — the **System Usability Scale (SUS)** — combined with
task-scenario observations and open-ended responses. Findings are tracked
and every actionable change is recorded in the integration table at the
bottom of this page.

---

## Why we collect feedback

Automated tests verify that the code *does what we intend*; user
feedback verifies that the product *works for the people it's for*. The
feedback process is a required part of our methodology: every round of
collection is followed by a round of integration, where each actionable
finding becomes a tracked issue with an assigned fix.

---

## The formal process

| Stage | What happens |
|---|---|
| **Instrument** | A Google Form with the 10 standard SUS items, 7 task-completion self-reports, and open-ended questions. |
| **Testers** | 5–8 per round: classmates, members of other teams, and our client (where available). Demographics are captured in the form itself. |
| **Session format** | 15–20 minutes, supervised. The tester works through the 7 task scenarios on the live app while an observer notes pass/fail and friction points on the observation sheet below. |
| **Recording** | Form responses land in a linked Google Sheet. An observer's written notes are kept alongside as a second data source. |
| **Analysis** | SUS scores per tester (0–100) and an average across the round; per-task pass/fail counts; open-ended responses grouped by theme. |
| **Integration** | Every actionable finding becomes an issue on the bug tracker with an owner and a fix commit. The integration table below records the full trail. |

---

## The feedback form

**Link:** [https://forms.gle/g4gEzYtiFRSXCQ5CA](https://forms.gle/g4gEzYtiFRSXCQ5CA)

The form is structured in four sections:

1. **Welcome & About You** — consent statement, role (Student / Lecturer or tutor / Working professional / Other), and prior experience with digital logbooks or work-tracking tools.
2. **Task Feedback** — for each of 7 tasks (register, create project, add entry, mark done, view stats, view calendar/board, enable 2FA), the tester self-reports *Completed easily / Completed with some difficulty / Could not complete*, plus an optional comment field per task.
3. **System Usability Scale** — the 10 standard SUS items on a 5-point Likert scale (Strongly disagree → Strongly agree). Worded verbatim; the SUS instrument is free to use and publicly cited across HCI research.
4. **Open Feedback** — most frustrating part (required), favourite feature, one-thing-to-change, and an NPS-style 0–10 recommend-likelihood scale.

A screenshot of the published form is captured after each round.

---

## Observation sheet (for the supervisor)

Self-reported answers are one half of the evidence; the other half is
what the observer actually sees. For each session, fill in this table on
paper alongside the tester:

| Task | Completed | Notes / friction points |
|---|---|---|
| 1. Register a new account | ✅ / ⚠️ / ❌ | |
| 2. Log in and create a project with custom fields | ✅ / ⚠️ / ❌ | |
| 3. Add a logbook entry (with duration + due date) | ✅ / ⚠️ / ❌ | |
| 4. Mark an entry as done | ✅ / ⚠️ / ❌ | |
| 5. Check project statistics (totals, averages) | ✅ / ⚠️ / ❌ | |
| 6. Find calendar and board views | ✅ / ⚠️ / ❌ | |
| 7. Enable two-factor authentication | ✅ / ⚠️ / ❌ | |

✅ = completed easily · ⚠️ = completed with difficulty · ❌ = could not complete.

---

## SUS scoring (in the linked Google Sheet)

When the form is linked to a Google Sheet (Responses → create
spreadsheet), add these helper columns to auto-score each row:

| Column | Header | Formula |
|---|---|---|
| `SUS_1` | `q1_adj` | `=B2-1` (odd item: subtract 1) |
| `SUS_2` | `q2_adj` | `=5-C2` (even item: 5 − answer) |
| `SUS_3` | `q3_adj` | `=D2-1` |
| `SUS_4` | `q4_adj` | `=5-E2` |
| `SUS_5` | `q5_adj` | `=F2-1` |
| `SUS_6` | `q6_adj` | `=5-G2` |
| `SUS_7` | `q7_adj` | `=H2-1` |
| `SUS_8` | `q8_adj` | `=5-I2` |
| `SUS_9` | `q9_adj` | `=J2-1` |
| `SUS_10` | `q10_adj` | `=5-K2` |
| | **SUS score** | `=SUM(q1_adj:q10_adj) * 2.5` (yields 0–100) |

> **Adjust column letters** to match the actual sheet columns produced by
> the grid question. The pattern — odd items score `answer − 1`, even
> items score `5 − answer`, then sum and multiply by 2.5 — is the
> canonical SUS calculation from Brooke (1996).

Average SUS across the round: `=AVERAGE(SUS_score_range)`.
Industry benchmarks (Sauro, 2011) place the average SUS at **68/100**;
anything above ~72 is above-average, above ~80 is excellent.

---

## Results — Sprint 2, Round 1

*First round: scheduled. Results will be filled after testing sessions
complete. Each round captures:*

- Number of testers, role breakdown (from the "About You" section)
- Average SUS score (with per-tester breakdown)
- Per-task self-reported pass rate
- Observer-noted friction points
- Top 3–5 themes from open-ended responses

---

## Integration: Feedback → Action → Commit

This is the trail that turns feedback into product changes. Every row is
a finding from a round, with the issue filed, the commit that fixed it,
and the round it was validated in.

| Round | Finding | Issue | Fix commit | Validated in |
|---|---|---|---|---|
| — | *(placeholders — to be filled as findings are filed and fixed)* | — | — | — |
| — | | — | — | — |
| — | | — | — | — |
| — | | — | — | — |

Once the first round is analysed, this table becomes the authoritative
evidence that feedback was acted on rather than just collected.

---

## Next steps

1. Distribute the form to 5–8 testers (classmates, other teams, client).
2. Run supervised sessions; observer notes alongside form responses.
3. Fill in the "Results" section and compute average SUS.
4. File actionable findings on the Gitea bug tracker.
5. Fix the top findings, cite commits here, and close issues.
6. Optionally run a second round to validate fixes (the "Validated in"
   column of the integration table).

*Related: [Testing](testing.md) documents the automated test suite that
runs alongside this process.*
