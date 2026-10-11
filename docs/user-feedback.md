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
| **Instrument** | A Google Form with the 10 standard SUS items, round-specific self-report questions, and an open-ended prompt. |
| **Testers** | 5–8 per round: classmates, members of other teams, and our client (where available). Demographics are captured in the form itself. |
| **Session format** | 15–20 minutes, supervised. The tester works through the 7 task scenarios on the live app while an observer notes pass/fail and friction points on the observation sheet below. |
| **Recording** | Form responses land in a linked Google Sheet. An observer's written notes are kept alongside as a second data source. |
| **Analysis** | SUS scores per tester (0–100) and an average across the round; per-task pass/fail counts; open-ended responses grouped by theme. |
| **Integration** | Every actionable finding becomes an issue on the bug tracker with an owner and a fix commit. The integration table below records the full trail. |

---

## The feedback form

**Round 1 form:** [https://forms.gle/g4gEzYtiFRSXCQ5CA](https://forms.gle/g4gEzYtiFRSXCQ5CA)

**Round 2 form (Sprint 3 revision):** [https://docs.google.com/forms/d/e/1FAIpQLSenlkuuQC3bUS3WPXpBDO8M0O4eNDGurk669OKzzlunm0X_ow/viewform](https://docs.google.com/forms/d/e/1FAIpQLSenlkuuQC3bUS3WPXpBDO8M0O4eNDGurk669OKzzlunm0X_ow/viewform)

The Round 1 form is structured in four sections:

1. **Welcome & About You** — consent statement, role (Student / Lecturer or tutor / Working professional / Other), and prior experience with digital logbooks or work-tracking tools.
2. **Task Feedback** — for each of 7 tasks (register, create project, add entry, mark done, view stats, view calendar/board, enable 2FA), the tester self-reports *Completed easily / Completed with some difficulty / Could not complete*, plus an optional comment field per task.
3. **System Usability Scale** — the 10 standard SUS items on a 5-point Likert scale (Strongly disagree → Strongly agree). Worded verbatim; the SUS instrument is free to use and publicly cited across HCI research.
4. **Open Feedback** — most frustrating part (required), favourite feature, one-thing-to-change, and an NPS-style 0–10 recommend-likelihood scale.

For Round 2 the questionnaire was revised so that every question maps to
a criterion in the Sprint 3 rubric: the SUS instrument was kept intact
(one 10-statement grid), and the task self-reports were replaced with
feature-usage, save-correctness, load-speed, entry-field clarity,
Calendar/Board discoverability, visual-integrity and one-thing-to-change
questions.

A screenshot of the published form is captured after each round.
The raw response data for each round is stored as a CSV file in this
repository (`docs/user-feedback-round1.csv` and
`docs/user-feedback-round2.csv`).

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

## Results — Sprint 3, Round 2 (28 September 2026)

**Testers:** 6 (two of whom also took part in Round 1). The revised
questionnaire does not collect demographics; it records feature usage,
reliability and quality perceptions instead.

### SUS Scores

| # | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 | **SUS** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5 | 1 | 5 | 4 | 5 | 1 | 5 | 1 | 5 | 4 | **85.0** |
| 2 | 5 | 2 | 5 | 1 | 4 | 2 | 5 | 1 | 5 | 1 | **92.5** |
| 3 | 4 | 2 | 4 | 3 | 5 | 3 | 4 | 1 | 5 | 1 | **80.0** |
| 4 | 2 | 1 | 5 | 5 | 4 | 2 | 2 | 3 | 5 | 4 | **57.5** |
| 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | **50.0** |
| 6 | 5 | 3 | 5 | 3 | 3 | 2 | 4 | 1 | 3 | 3 | **70.0** |

**Average SUS: 72.5 / 100** — on par with Round 1 (72.9) and above the
industry average of 68 (Sauro, 2011); median 75.

> **Data-quality note:** one respondent selected "Strongly agree" for all
> ten statements — including items that contradict each other (easy to
> use *and* cumbersome) — the classic straight-line pattern, which is
> normally excluded from SUS averages. Excluding it, the round averages
> **77.0 / 100**. The all-in figure is reported here, and both figures
> sit above the 68 benchmark.

### Questionnaire results (rubric-mapped questions)

| Question | Round 2 result |
|---|---|
| Features used in the session | Calendar view 6/6 · Board view 4/6 · Tags 4/6 · Entry history 4/6 · Two-factor auth 4/6 · Statistics 3/6 · Saved filters 1/6 |
| Anything misbehave? | 5/6 "Never"; one "Once or twice" (no detail supplied) |
| Saved correctly every time? | 5/6 "Yes, every time"; one single save failure reported (no reproduction detail) |
| Load & response speed | 5/6 "Okay, brief waits"; one "Slow, noticeable waiting" — login or registration was named the slowest moment by three testers |
| Entry-field clarity | 3/6 "Very clear", 3/6 "Mostly clear", none confused *(Round 1: 2/6 struggled)* |
| Calendar & Board discoverability | 6/6 "Found them straight away" *(Round 1: 1/6 struggled)* |
| Visual integrity | 5/6 saw no issues; one "Yes" with no location recorded |
| One small change | four "nothing"; one "nothing besides faster login"; one "year-to-date calculator / grade tracking" |

### Findings

- **Login latency is the one recurring friction.** Three testers named
  login or registration as the slowest moment, and nobody reported any
  other performance problem — consistent with the free hosting tier's
  cold start (see the integration table for what was done about it).
- **Reliability held up.** Five of six testers saw no misbehaviour and
  reported that saving worked every time; the two exceptions were
  single occurrences with no reproduction detail.
- **Round 1's friction points did not resurface.** No tester was
  confused by entry fields, and every tester found the Calendar and
  Board views straight away. The queued FEAT-002 / FEAT-003
  improvements remain in the integration table.

---

## Integration: Feedback → Action → Commit

This is the trail that turns feedback into product changes. Every row is
a finding from a round, with the issue filed, the commit that fixed it,
and the round it was validated in.

| Round | Finding | Action taken | Commit | Validated in |
|---|---|---|---|---|
| R1 | Tester 5 requested saved filters on the entries page | Saved-filter feature implemented — name, save, apply, delete — first in localStorage, later kept on the account so filters follow the student between devices | `fd68b32` feat: add saved filters on entries page; `43534ad` feat: keep saved filters on the account | R1 (pre-emptive; shipped before feedback was collected) |
| R1 | Testers 1 & 2 found entry-field format confusing when adding entries | Filed as Gitea issue **FEAT-002**; add inline help text and field-type hints to the entry form | *(FEAT-002 partly addressed: required fields are marked and tag and link fields show placeholder hints; per-type badges and formula tooltips are still open)* | R2 — no tester confused by entry fields |
| R1 | Tester 2 found calendar/board views hard to locate | Filed as Gitea issue **FEAT-003**; consider adding nav hints or a guided tour for secondary views | *(FEAT-003 partly addressed: the sidebar groups pages under Today, Work, Academics and Personal with an icon for each, and the help assistant can take a student to any page; no guided tour)* | R2 — 6/6 found Calendar and Board straight away |
| R1 | All 6 testers praised the UI and ease of use | No action needed — validates current design direction | — | — |
| R2 | Three testers named login/registration as the slowest moment; one rated speed "Slow, noticeable waiting" | Hosting stayed on Render's free tier. Instead, a scheduled pinger keeps the API awake from 06:00 to 23:50 so daytime sign-ins skip the cold start (see [Setup](setup.md#keeping-the-api-awake)) | `cf51ac4` docs: record the cron-job.org pinger that keeps the API awake | — |
| R2 | Tester 1 suggested a year-to-date / grade-tracking view | Filed as Gitea issue **FEAT-009**, then built as the **My Grades** feature — modules, secured marks, target grades and a what-if calculator ([My Grades](extra-features/my-grades.md)) | `0dea059` feat(grades): add modules and assessments API; `7e26597` feat(grades): add My Grades pages | — |
| R2 | One single save failure and one "once or twice" misbehaviour, with no reproduction detail | Logged for monitoring — to be re-checked in Round 3 | — | — |

---

## Summary and Next Steps

Round 1 (SUS 72.9) and Round 2 (SUS 72.5; 77.0 excluding one
straight-line response) both sit above the industry average of 68, and
Round 2 held up on reliability: five of six testers saw no misbehaviour
and reported that saving worked every time. The one recurring complaint
across rounds is login/registration latency, which matches the free
hosting tier's cold start.

Round 1's friction points (entry-field clarity, view discoverability)
did not resurface in Round 2; FEAT-002 and FEAT-003 have been partly
addressed, as the integration table records.

**Planned actions:**

1. Keep the API awake during the day with the scheduled pinger (done); moving off the free tier would remove the night-time cold start too.
2. Finish FEAT-002 (field-type badges, formula tooltips) and FEAT-003 (a first-visit tour).
3. Run Round 3, including a client review session, and fill in the "Validated in" column.

*(Done since Round 2: the grade-tracking suggestion was built as **My Grades** — see the integration table above.)*

*Related: [Testing](testing.md) documents the automated test suite that
runs alongside this process.*
