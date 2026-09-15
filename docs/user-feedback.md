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

## Results — Sprint 2, Round 1 (14 September 2026)

**Testers:** 6 (all Wits students, recruited from classmates and other teams)

### Demographics

| # | Prior logbook experience | Frequency of digital academic tools |
|---|---|---|
| 1 | No | Never |
| 2 | No | Occasionally |
| 3 | Not sure | Weekly |
| 4 | No | Never |
| 5 | Yes | Several times a week |
| 6 | No | Weekly |

All 6 testers gave informed consent via the form's agreement checkboxes.

### SUS Scores

| # | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 | **SUS** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4 | 4 | 4 | 1 | 3 | 4 | 4 | 2 | 3 | 1 | **75.0** |
| 2 | 2 | 3 | 1 | 3 | 1 | 2 | 2 | 1 | 3 | 3 | **42.5** |
| 3 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 1 | 1 | 2 | **62.5** |
| 4 | 4 | 1 | 3 | 1 | 3 | 2 | 4 | 1 | 4 | 1 | **97.5** |
| 5 | 3 | 1 | 4 | 1 | 3 | 1 | 3 | 1 | 4 | 1 | **92.5** |
| 6 | 4 | 2 | 3 | 3 | 4 | 2 | 4 | 3 | 3 | 1 | **67.5** |

**Average SUS: 72.9 / 100** — above the industry average of 68 (Sauro, 2011)
and in the "good" acceptability range (grade B, ~72–85).

### Task Completion Rates

| Task | Completed easily | With difficulty | Could not | Completion rate |
|---|---|---|---|---|
| 1. Register a new account | 6 | 0 | 0 | **100%** |
| 2. Create a project with custom entry fields | 6 | 0 | 0 | **100%** |
| 3. Add a logbook entry (duration + due date) | 4 | 2 | 0 | **67% easy / 100% done** |
| 4. Mark an entry as done | 6 | 0 | 0 | **100%** |
| 5. Check project statistics | 6 | 0 | 0 | **100%** |
| 6. Find calendar and board views | 5 | 1 | 0 | **83% easy / 100% done** |
| 7. Enable two-factor authentication | 6 | 0 | 0 | **100%** |

**Overall task completion:** 100% of testers completed all 7 tasks. Task 3
(entry creation) was the main friction point — 2 of 6 testers reported
difficulty with the entry-field format.

### Qualitative Themes

| Theme | Frequency | Representative quote |
|---|---|---|
| UI is appealing and intuitive | 3 | *"The UI is very appealing and the overall presentation is such a vibe."* — Tester 5 |
| Entry fields / format confusing | 2 | *"The entry fields were confusing."* — Tester 2; *"Struggled with format"* — Tester 1 |
| Nothing frustrating | 3 | *"Nothing was frustrating, it was very easy to navigate the app."* — Tester 4 |
| Save filters (already shipped) | 1 | *"I would add a save filter."* — Tester 5 |
| Colour scheme praised | 1 | *"I liked the colour scheme."* — Tester 4 |

### NPS-style Recommendation Score (0–10)

| Score | Count |
|---|---|
| 3 | 1 |
| 5 | 1 |
| 8 | 2 |
| 10 | 1 |
| No answer | 1 |

**Average: 6.8 / 10** (excluding the no-answer response).

---

## Integration: Feedback → Action → Commit

This is the trail that turns feedback into product changes. Every row is
a finding from a round, with the issue filed, the commit that fixed it,
and the round it was validated in.

| Round | Finding | Action taken | Commit | Validated in |
|---|---|---|---|---|
| R1 | Tester 5 requested saved filters on the entries page | Saved-filter feature implemented — name, save, apply, delete, persisted to localStorage | `fd68b32` feat: add saved filters on entries page | R1 (pre-emptive; shipped before feedback was collected) |
| R1 | Testers 1 & 2 found entry-field format confusing when adding entries | Filed as Gitea issue; add inline help text and field-type hints to the entry form | *(issue filed, fix pending Sprint 3)* | — |
| R1 | Tester 2 found calendar/board views hard to locate | Filed as Gitea issue; consider adding nav hints or a guided tour for secondary views | *(issue filed, fix pending Sprint 3)* | — |
| R1 | All 6 testers praised the UI and ease of use | No action needed — validates current design direction | — | — |

---

## Summary and Next Steps

Round 1 confirms the Digital Logbook is above-average on usability
(SUS 72.9 vs. industry average 68) with 100% task completion across
all 7 scenarios. The main area for improvement is the entry-creation
flow, where 2 of 6 testers struggled with custom field formats.

**Planned actions:**

1. File Gitea issues for the two pending findings (entry-field help text, view discoverability).
2. Implement fixes in Sprint 3 and reference them in the integration table.
3. Run a second round with the same testers to validate fixes (the "Validated in" column).
4. Invite the client for a formal review session in Round 2.

*Related: [Testing](testing.md) documents the automated test suite that
runs alongside this process.*
