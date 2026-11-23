# Session kinds, weekly missions and how they map to the plan

The plan itself is in [sasmo-plan.md](sasmo-plan.md). Vocabulary: one question = a **ball**, one session = an **innings**, one week of the plan = a **match**.

## Question kinds
`questions.kind` (see `schema.sql`, `lib/api/pick.js`). Questions carry `week` (0 = any week), `topic`, `difficulty` (1 easy, 2 medium, 3 hard), `answer`, optional `options` (multiple choice, answer = 0-based index) and `method` (one-line worked solution shown in review).

Weekly format (30 questions a week, from `weekly-content`): 6 `before` + 12 `practice` + 6 `puzzle` + 6 `after`. `practice` is free-text only; `before`, `after` and `puzzle` mix multiple choice and free-text about half and half.

| Kind | Role in the plan | What the app serves |
| --- | --- | --- |
| `before` | Toss: Saturday check before the topic is taught | All `before` questions for the week (6) |
| `practice` | Nets: Mon, Tue, Wed practice (4 questions per session) | 4 random from the week, preferring ones he hasn't got right; tops up from earlier weeks and week 0 |
| `puzzle` | Thursday scored puzzle day (6 questions) | 6: this week's first, then week-0 puzzles; preferring ones he hasn't got right |
| `after` | Sunday check after teaching; gain vs `before` earns an improvement badge | All `after` questions for the week (6) |
| `revision` | "Replay": re-serves up to 5 questions he got wrong and hasn't since got right. Not a stored kind | Wrong-then-unfixed attempts only, up to 5 (no top-up) |
| `diagnostic` | The original 20-question baseline. Still startable through the API but no longer a mission | All `diagnostic` questions, in id order |
| `mock` | Full mock (weeks 6, 12, 16, 19; past papers 17-18) | All `mock` questions for the week; with none, 20 random from the other kinds |
| `worksheet` | Saturday Match (paper or on-screen worksheet) | Questions attached to a worksheet, see [worksheets.md](worksheets.md) |

## Weekly missions (slots)
Code: `lib/api/slots.js` (plan, statuses, rules), `lib/api/kid-state.js` (what the kid sees). The parent publishes a week once (dashboard, **Week plan** tab, or `POST /api/parent/plan/:week/publish` with optional `{ days: { slot: "YYYY-MM-DD" } }`), which creates the standard 7 missions below. Until a week is published the kid can play none of it. Weeks start on Monday; default days:

| Slot | Kind | Default day |
| --- | --- | --- |
| Nets 1 / 2 / 3 | `practice` | Mon / Tue / Wed |
| Spin puzzle | `puzzle` | Thursday |
| Toss | `before` | Saturday |
| Match | `worksheet` (the week's worksheet, on screen or by paper submit) | Saturday |
| Super over | `after` | Sunday |

A mission belongs to a plan week (its questions come from that week) but its date is the parent's to set, so it can be moved into a later week for a holiday, sickness or exams. It keeps its week's questions and is not `late`, because lateness is measured against its current date.
- **Nets and Spin puzzle** are repeatable: `POST /api/parent/plan/:week/add { kind: "nets"|"puzzle", day }` adds one (`nets4`, `puzzle2`, ...). The kid sees them labelled by date.
- **Toss, Match and Super over** are one per week, labelled by week ("Toss · Week 2"), because each week has its own questions or worksheet. Two Tosses in one calendar week means two plan weeks' Tosses. The Toss may not be dated after the same week's Super over.
- Any unfinished mission can be dropped with `DELETE /api/parent/plan/:week/:slot` (finished ones stay in his record: 409). Re-publishing a published week only changes the dates it is sent.
- Slot names: `nets<n>`, `puzzle` / `puzzle<n>`, `toss`, `match`, `over` (`slotInfo` in `slots.js` derives the kind from the name).

Replay (`revision`) is an optional extra, not a slot, and can be played any day, but only while he has unfixed mistakes. With none, `POST /api/session/start` returns 404 and the home button is disabled (`replay.due` in `/api/state`).

Rules, all enforced in `POST /api/session/start` (the client only sends `slot` and `week`; the server decides the kind and today from its own clock, so changing the device date does nothing):
- Slot statuses: `locked` (day is ahead, never playable), `open` (today), `missed` (past and not done, still playable), `done`, `skip` (the day is a rest day or holiday, not a failure), `na` (no questions or worksheet yet), `unpublished`.
- A missed slot can be caught up on a later day. The mission then counts as **failed** (`late: true`). The missed day also broke the streak (the regularity bonus), as before. Nothing else is lost.
- Daily allowance: he can start as many missions today as the parent scheduled on today's date (at least 1; the Saturday Match worksheet is exempt). A catch-up uses up one of today's allowance. Put two missions on one date and he can play both that day; a restart of an unfinished try doesn't count twice.
- Badge **Full Match**: every slot of a week that could be played was finished on its own day (skipped and no-content slots do not count against him).
- The kid's home shows every mission of any plan week dated in the next 7 days (locked until its day) plus every earlier one he hasn't finished (`missions` in `/api/state`, built by `upcoming()`). Nothing disappears when the calendar week rolls over.

## Content coverage (data/questions.json, 126 questions)
- **Week 1 (no fixed topic, so Sunday's result picks week 2's topic):** 6 `before` + 6 `after` (copies of diagnostic questions, paired by topic, half multiple choice), 12 free-text `practice` (8 more diagnostic copies plus 4 number-sense), and the 10 any-week puzzles (5 multiple choice) cover 6 puzzles per session. The 20 original `diagnostic` rows are kept.
- 4 spare number-sense `practice` questions are week 0 (any week); they fill in when a week's pool runs short.
- Weeks 2-5 still have the older format: `practice` 6-7 per week and 5 `before` / 5 `after`. Weeks 6-19 have nothing yet; the `weekly-content` skill generates them.
- Multiple-choice questions today: 2 diagnostic, 3 before, 3 after, 5 puzzles.
