# Saturday worksheets (the Match), paper practice and daily stats

## Upload (parent login required)
Adding a worksheet is **two calls to existing routes** (the skill and the dashboard's Add worksheet form both do this):

1. `POST /api/parent/worksheets` creates the worksheet and returns its `id`:
```json
{ "title": "Week 2: Fractions", "set_date": "2026-11-29", "week": 2,
  "mode": "paper", "time_limit_min": 45, "runs_table": { "1": 1, "3": 3 },
  "pdf_base64": "<printable PDF incl. OMR sheet, under ~1.3 MB>" }
```
2. `POST /api/parent/questions/import` attaches the questions (call it **once**: calling twice appends):
```json
{ "worksheet_id": 7,
  "questions": [ { "q": "2+2?", "a": "4", "t": "Add", "d": 1, "m": "worked solution" },
                 { "q": "Pick even", "o": ["3","4","5"], "a": "1", "d": 3 } ] }
```
With `worksheet_id` the server forces `kind='worksheet'` and `week` = the worksheet's week and stores the worksheet id on every row. `questions` may also be sent directly in call 1 (older callers). Import into a worksheet is 404 for an unknown or deleted id and **409 once any session exists** for it. Without `worksheet_id` the import still makes ordinary bank questions.

The calls are not atomic. If call 2 fails the caller must `DELETE /api/parent/worksheets/:id`. A worksheet with **no active questions is invisible**: not in the kid's list, not counted for the Match slot, not picked by `slotForStart`, not in the week's potential. So an orphan from a failed upload is harmless until deleted.

`mode` is `screen` (default: played on screen) or `paper` (printed; the kid fills an OMR-style answer grid). `time_limit_min` (1 to 240, optional) is the clock: no limit means no clock. Question order = number on the sheet (Q1, Q2, ...). For multiple choice `a` is the 0-based option index (A=0, B=1, ...). `d` is the difficulty 1 to 3 of each question (default 2).

**Runs table.** `runs_table` maps difficulty to runs for a correct answer, e.g. `{"1":1,"3":3}` (keys 1 to 3, values whole numbers >= 1, no cap). A missing key, or no table (`null`), falls back to the global `RUNS_FOR` (2 / 4 / 6). Hand-in marking and the week potential use it. Worked example, the Class 5 Mock Paper: Q1-45 `d1`, Q46-50 `d3`, table `{"1":1,"3":3}` pays at most 60 runs. There is no range syntax in the API; the skill and the form expand "Q46-50 = d3" into a `d` per question.

## Editing
`PUT /api/parent/worksheets/:id` takes any of `{ mode?, time_limit_min?, runs_table?, week?, set_date? }`.
- `mode`, `time_limit_min` (`null` removes the clock) and `runs_table` (`null` = global): 409 once it is handed in. A sitting already open follows the new settings when reopened, and the server uses the new limit to decide lateness. A changed table only affects hand-ins made afterwards.
- `week` (whole number 1 to 19) and `set_date` (`YYYY-MM-DD`): **409 once any session exists** (started or handed in), so an open clock or draft never moves to another Match slot. The worksheet's questions follow the new week in the same batch. If another active worksheet already uses that week the move is allowed; the Match slot plays the newest one.
- Replace the PDF with `POST /api/parent/worksheets/:id/pdf`; remove with `DELETE /api/parent/worksheets/:id`. Delete + re-upload is always the fallback.

## Kid side
Every worksheet has a `week` (1 to 19, required; 400 otherwise) and is that week's **Match** slot: it can only be handed in or started on screen once that slot is open or missed (never ahead of its day), see [sessions-and-missions.md](sessions-and-missions.md). On-screen play is `POST /api/session/start` with `{ slot: "match", week }`; the server picks the week's newest worksheet. A worksheet is handed in once.

- `GET /api/worksheets` list, `GET /api/worksheets/:id` questions (no answers), `GET /api/worksheets/:id/pdf` download.
- **Playing on screen / paper:** `POST /api/session/start` with `{ slot: "match", week }` returns every question, the saved `draft` and `session.worksheet_id`. Start again (another device, closed tab) and the same session comes back with the **original `started_at`** and the draft; a worksheet clock never restarts. Nothing is graded while playing: `/session/:id/answer` and `/session/:id/finish` refuse worksheet sessions.
- **Draft:** `PUT /api/session/:id/draft` with `{ answers: { "<question_id>": "..." } }` replaces the saved answers (they can change until hand-in). Answers for questions outside the worksheet are ignored.
- **Clock:** the limit runs from the session's `started_at` (wall-clock; closing the tab or switching device does not pause it). `/session/start` returns `mode`, `time_limit_min` and the server's `now`, and the screen counts down from those; there is no polling. The server decides lateness at hand-in, with a 15 second grace for network delay. **Late** (`sessions.late = 1`): runs are 0, no badges, no daily bonus, and the day does not count for the streak (`streak.js` ignores late sessions). The review is still returned (`late: true`), the hand-in is final, and `duration_s` is capped at the limit. `source` is `paper` when the worksheet's mode is `paper`.
- **Hand in:** `POST /api/worksheets/:id/submit` with `{ session_id, answers: { "<question_id>": "1", "<question_id>": "" } }`. Blank = skipped. It marks everything together, pays runs and the daily bonus, awards badges, deletes the draft and returns the review plus `totals` and the stadium stage before and after. Duration is the time since the session started (capped at 240 minutes). Without `session_id` it creates a `paper` session from the typed `minutes` (kept for the skill and the API).
- **One attempt only:** a worksheet can be handed in once. A second submit or a new start returns 409. To run a sheet again the parent uploads it again; wrong and skipped answers come back through Replay.

## What is recorded
- `attempts.skipped = 1` for blank answers and for questions never reached when an innings finishes.
- `sessions.source` is `app` or `paper`; paper time comes from the `minutes` the kid enters and counts like app time.
- `GET /api/parent/daily?days=30` returns per IST day: `minutes`, `sessions`, `correct`, `total`, `skipped`, `paper_sessions`. Sessions abandoned before finish use the sum of per-question times.

## Notes
- The PDF lives in D1 as base64 (no R2 bucket). Keep it under ~1.3 MB.
- Existing databases need `ALTER TABLE` for the new columns (`questions.worksheet_id`, `sessions.source/worksheet_id`, `attempts.skipped`) and the new tables (`worksheets`, `worksheet_files`, and `worksheet_drafts` via `migrations/2026-11-worksheet-drafts.sql`); `migrations/2026-11-worksheet-timer.sql` adds `worksheets.mode`, `worksheets.time_limit_min` and `sessions.late`; `migrations/2026-11-worksheet-runs-table.sql` adds `worksheets.runs_table`; a fresh `db:init:remote` has them already.
- UI: kid screens in `public/js/kid/sheets.js`, `sheet-play.js`, `sheet-omr.js`, `sheet-review.js` (`#sheets`, `#play/worksheet/match/<week>`); parent tabs **Daily** and **Worksheets** in `public/js/parent/` (list, edit, replace PDF, delete, paper and late marks in Sessions). **Add worksheet** is `worksheet-add.js` (form, two calls, rollback) with the pure checks in `worksheet-check.js`: pick the JSON from the skill and the PDF (required for paper mode only), edit the prefilled fields, set difficulty by ranges ("1-45=1, 46-50=3"), preview count, max runs and problems. Making the JSON from a markdown paper is the `worksheet-from-markdown` skill.
- Code: `lib/api/worksheets.js` (upload, edit, list, PDF), `lib/api/runs-table.js` (per-worksheet runs table), bank import in `lib/api/routes-parent.js`, `lib/api/worksheet-play.js` (draft, resume, hand-in), `lib/api/finish.js` (shared end of an innings).
