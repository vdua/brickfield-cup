# Session kinds, weekly missions and how they map to the plan

The plan itself is in [sasmo-plan.md](sasmo-plan.md). Vocabulary: one question = a **ball**, one session = an **innings**, one week of the plan = a **match**.

## Question kinds
`questions.kind` (see `schema.sql`, `lib/api/pick.js`). Questions carry `week` (0 = any week), `topic`, `difficulty` (1 easy, 2 medium, 3 hard), `answer`, optional `options` (multiple choice, answer = 0-based index) and `method` (one-line worked solution shown in review).

Weekly format (30 questions a week, from `weekly-content`): 6 `before` + 12 `practice` + 6 `puzzle` + 6 `after`. `practice` is free-text only; `before`, `after` and `puzzle` mix multiple choice and free-text about half and half.

| Kind | Role in the plan | What the app serves |
| --- | --- | --- |
| `before` | Saturday check before the topic is taught | All `before` questions for the week (6) |
| `practice` | Mon, Tue, Wed practice (4 questions per session) | 4 random from the week, preferring ones he hasn't got right; tops up from earlier weeks and week 0 |
| `puzzle` | Thursday scored puzzle day (6 questions) | 6: this week's first, then week-0 puzzles; preferring ones he hasn't got right |
| `after` | Sunday check after teaching; gain vs `before` earns an improvement badge | All `after` questions for the week (6) |
| `revision` | "Replay": re-serves 5 questions he got wrong and hasn't since got right. Not a stored kind | Wrong-then-unfixed attempts, topped up from practice |
| `diagnostic` | The original 20-question baseline. Still startable through the API but no longer a mission | All `diagnostic` questions, in id order |
| `mock` | Full mock (weeks 6, 12, 16, 19; past papers 17-18) | All `mock` questions for the week; with none, 20 random from the other kinds |
| `worksheet` | Sunday paper worksheet | Questions attached to a worksheet, see [worksheets.md](worksheets.md) |

## Weekly missions (the home-screen checklist)
`MISSION` in `lib/content.js`. A box ticks when he has finished `need` sessions of that kind in the current week (`lib/api/kid-state.js`). Missions give nothing by themselves; runs and badges come from the sessions.

| Mission | Kind | Need per week | Day |
| --- | --- | --- | --- |
| Toss | `before` | 1 | Saturday |
| Nets | `practice` | 3 | Mon, Tue, Wed |
| Spin puzzle | `puzzle` | 1 | Thursday |
| Replay | `revision` | 1 | Optional, any day |
| Final over | `after` | 1 | Sunday |

Toss and Final over show as unavailable when the week has no `before` / `after` questions. A Sunday worksheet is not a mission; it earns runs and badges and counts toward the streak. The app does not tie sessions to weekdays; the days above are the plan.

## Content coverage (data/questions.json, 126 questions)
- **Week 1 (no fixed topic, so Sunday's result picks week 2's topic):** 6 `before` + 6 `after` (copies of diagnostic questions, paired by topic, half multiple choice), 12 free-text `practice` (8 more diagnostic copies plus 4 number-sense), and the 10 any-week puzzles (5 multiple choice) cover 6 puzzles per session. The 20 original `diagnostic` rows are kept.
- 4 spare number-sense `practice` questions are week 0 (any week); they fill in when a week's pool runs short.
- Weeks 2-5 still have the older format: `practice` 6-7 per week and 5 `before` / 5 `after`. Weeks 6-19 have nothing yet; the `weekly-content` skill generates them.
- Multiple-choice questions today: 2 diagnostic, 3 before, 3 after, 5 puzzles.
