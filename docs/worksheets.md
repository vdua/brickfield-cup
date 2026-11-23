# Daily worksheets, paper practice and daily stats

## Upload (parent login required)
`POST /api/parent/worksheets`

```json
{ "title": "Day 1: Fractions", "set_date": "2026-11-24", "week": 2,
  "pdf_base64": "<printable PDF incl. OMR sheet, under ~1.3 MB>",
  "questions": [ { "q": "2+2?", "a": "4", "t": "Add", "d": 1, "m": "worked solution" },
                 { "q": "Pick even", "o": ["3","4","5"], "a": "1" } ] }
```
Question order = number on the sheet (Q1, Q2, ...). For multiple choice `a` is the 0-based option index (A=0, B=1, ...). Replace the PDF with `POST /api/parent/worksheets/:id/pdf`; remove with `DELETE /api/parent/worksheets/:id`.

## Kid side
- `GET /api/worksheets` list, `GET /api/worksheets/:id` questions (no answers), `GET /api/worksheets/:id/pdf` download.
- **OMR submit:** `POST /api/worksheets/:id/submit` with `{ answers: { "<question_id>": "1", "<question_id>": "" }, minutes: 12 }`. Blank = skipped. Creates a `paper` session, marks it, awards runs and badges, and returns the review. Repeats are allowed: only the most recent finished attempt of a worksheet counts towards runs, totals and the daily score; time spent counts for every attempt, on screen or paper.
- Can also be played on screen: `POST /api/session/start` with `{ kind: "worksheet", worksheet_id }`.

## What is recorded
- `attempts.skipped = 1` for blank answers and for questions never reached when an innings finishes.
- `sessions.source` is `app` or `paper`; paper time comes from the `minutes` the kid enters and counts like app time.
- `GET /api/parent/daily?days=30` returns per IST day: `minutes`, `sessions`, `correct`, `total`, `skipped`, `paper_sessions`. Sessions abandoned before finish use the sum of per-question times.

## Notes
- The PDF lives in D1 as base64 (no R2 bucket). Keep it under ~1.3 MB.
- Existing databases need `ALTER TABLE` for the new columns (`questions.worksheet_id`, `sessions.source/worksheet_id`, `attempts.skipped`) and the two new tables; a fresh `db:init:remote` has them already.
- There is no UI yet for these endpoints; the skill and the API are the way in for now.
