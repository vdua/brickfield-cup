# Session kinds, weekly missions and how they map to the plan

The plan itself is in [sasmo-plan.md](sasmo-plan.md). Vocabulary: one question = a **ball**, one session = an **innings**, one week of the plan = a **match**.

## Question kinds
`questions.kind` (see `schema.sql`, `lib/api/pick.js`). Questions carry `week` (0 = any week), `topic`, `difficulty` (1 easy, 2 medium, 3 hard), `answer`, optional `options` (multiple choice, answer = 0-based index) and `method` (one-line worked solution shown in review).

| Kind | Role in the plan | What the app serves |
| --- | --- | --- |
| `diagnostic` | Week 1 baseline (20 questions, 45 min), replaces the Saturday before-check in week 1 | All `diagnostic` questions, in id order |
| `before` | Saturday check before the topic is taught | All `before` questions for the week (no limit) |
| `after` | Sunday check after teaching; gain vs `before` earns an improvement badge | All `after` questions for the week (no limit) |
| `practice` | Weekday practice on the week's topic | 6 random, preferring ones he hasn't got right; tops up from earlier weeks |
| `puzzle` | Wednesday logic/puzzle day | 3 random, preferring ones he hasn't got right (use week 0) |
| `mock` | Full mock (weeks 6, 12, 16, 19; past papers 17–18) | All `mock` questions for the week; with none, 20 random from the other kinds |
| `worksheet` | Sunday paper worksheet | Questions attached to a worksheet, see [worksheets.md](worksheets.md) |
| `revision` | Thursday "redo old mistakes". Not a stored kind: a session type built from earlier wrong answers | 5 questions he got wrong and hasn't since got right; tops up from practice |

## Weekly missions (the home-screen checklist)
`MISSION` in `lib/content.js`. A box ticks when he has finished `need` sessions of that kind in the current week (`lib/api/kid-state.js`). Missions give nothing by themselves; runs and badges come from the sessions.

| Mission | Kind | Need per week | Plan day |
| --- | --- | --- | --- |
| Toss | `before` (`diagnostic` in week 1) | 1 | Saturday |
| Nets | `practice` | 4 | Mon–Tue weekdays |
| Spin puzzle | `puzzle` | 1 | Wednesday |
| Replay | `revision` | 1 | Thursday |
| Final over | `after` | 1 | Sunday |

Toss and Final over show as unavailable when the week has no `before` / `after` questions. A Sunday worksheet is not a mission; it earns runs and badges and counts toward the streak.

## Weekday sessions per day
The plan (Mon–Thu, Fri off): Mon 6 practice, Tue 6 harder practice, Wed 3 puzzles, Thu 5 redone mistakes (+ 10 mental-maths drills on paper).

The app does not tie sessions to weekdays. It only counts finished sessions per kind per week, so any day works. Differences from the plan:
- "Nets" needs 4 practice sessions (24 questions) a week; the plan has 2 (Mon, Tue = 12). Tuesday is not "harder": both draw randomly from the week's `practice` pool, ignoring difficulty.
- Mental-maths drills and the Sunday 8-question mixed set are not in the app.

## Content coverage (data/questions.json, 106 questions)
- `diagnostic`: 20 (week 1). `practice`: weeks 1–5 only (6–8 per week). `before` / `after`: 5 each for weeks 2–5 only. `puzzle`: 10 (any week).
- **Weeks 6–19 have no questions** (no before/after/practice/mock). Those weeks need content before the plan reaches them (week 6 starts 28 Dec 2026).
- A week needs ~24 practice questions for 4 sessions; the pool has 6–8, so questions repeat within a week.
- No question uses `options`, so there is no multiple-choice practice yet, but SASMO is multiple-choice/short-answer.
