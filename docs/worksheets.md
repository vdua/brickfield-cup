# Saturday worksheets (the Match), paper practice and daily stats

## Upload (parent login required)
`POST /api/parent/worksheets`

```json
{ "title": "Week 2: Fractions", "set_date": "2026-11-29", "week": 2,
  "mode": "paper", "time_limit_min": 45,
  "pdf_base64": "<printable PDF incl. OMR sheet, under ~1.3 MB>",
  "questions": [ { "q": "2+2?", "a": "4", "t": "Add", "d": 1, "m": "worked solution" },
                 { "q": "Pick even", "o": ["3","4","5"], "a": "1" } ] }
```
`mode` is `screen` (default: played on screen) or `paper` (printed; the kid fills an OMR-style answer grid). `time_limit_min` (1 to 240, optional) is the clock: no limit means no clock. Question order = number on the sheet (Q1, Q2, ...). For multiple choice `a` is the 0-based option index (A=0, B=1, ...). Replace the PDF with `POST /api/parent/worksheets/:id/pdf`; remove with `DELETE /api/parent/worksheets/:id`.

## Kid side
A worksheet with `week` > 0 is the week's **Match** slot: it can only be handed in or started on screen once that slot is open or missed (never ahead of its day), see [sessions-and-missions.md](sessions-and-missions.md). On-screen play is `POST /api/session/start` with `{ slot: "match", week }`; the server picks the week's newest worksheet. A worksheet is handed in once; week-0 worksheets have no slot and are ungated for paper hand-in.

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
- Existing databases need `ALTER TABLE` for the new columns (`questions.worksheet_id`, `sessions.source/worksheet_id`, `attempts.skipped`) and the new tables (`worksheets`, `worksheet_files`, and `worksheet_drafts` via `migrations/2026-11-worksheet-drafts.sql`); `migrations/2026-11-worksheet-timer.sql` adds `worksheets.mode`, `worksheets.time_limit_min` and `sessions.late`; a fresh `db:init:remote` has them already.
- There is no UI yet for these endpoints; the skill and the API are the way in for now.
- Code: `lib/api/worksheets.js` (upload, list, PDF), `lib/api/worksheet-play.js` (draft, resume, hand-in), `lib/api/finish.js` (shared end of an innings).
