---
name: worksheet-from-markdown
description: Turn a markdown mock paper plus its PDF into the Brickfield Cup worksheet upload JSON, run the integrity checks, and optionally upload it. Use when the user hands over a mock paper (.md + .pdf), says "make a worksheet from this paper", "convert the mock paper", or "upload the mock paper".
---

# Mock paper (markdown + PDF) -> worksheet JSON

Read first: `docs/worksheets.md` (upload API, runs table).

## Inputs
- The markdown paper, and its PDF (the PDF is only embedded for the upload; it is never parsed by the server).
- **Required: `--week` 1 to 19** (ask the user if they have not said; every worksheet belongs to a week and plays as that week's Match). Optional: `--time` minutes (the paper's own time is the default), `--mode screen|paper` (default screen: ask whether it is printed), `--date` (`set_date` stays `null` when not given; the dashboard form fills today).

## Expected markdown format
- Header: title (`# ...`), `Time: N minutes`, `Total marks: N`, `N questions`.
- `## Section X: <name> (N mark(s) each)` headings; questions as `**n.** text`, then a blank line and `(A) .. (B) .. (C) .. (D) ..` on one line.
- `## Answer key` with a table of `Q | Ans` pairs (letters A-D).

## Steps
1. Run the parser (writes the JSON, prints the checks, exit 1 on a failed check):
   `python3 .claude/skills/worksheet-from-markdown/scripts/parse_paper.py PAPER.md OUT.json --pdf PAPER.pdf --week 2 [--time 90] [--mode screen] [--date 2026-11-29]`
   It checks: question numbers 1..N in order, exactly 4 options each, one key per question and none extra, question count and total marks against the header, and that the PDF has every question number in order with matching opening text (needs `pdftotext`). It warns when `--time` differs from the markdown.
2. **Spot-check the answers yourself.** The script only checks that a key exists. Work out as many questions as you can (all of them if feasible) and list every one that disagrees with the key, with your working. **Never silently change the key or the JSON.** Report disagreements and let the user decide.
3. Marks become difficulty: a section's marks (1, 2 or 3) are used as `d`, and `runs_table` maps `d` to marks (Class 5 mock: Q1-45 `d1`, Q46-50 `d3`, `{"1":1,"3":3}` = at most 60 runs, matching the paper's /60). If the marks do not fit 1 to 3 the parser ranks them instead; tell the user.
4. Report: counts, max runs, time warning, PDF result, answer disagreements. Stop here unless the user asked to upload.

## Upload (only when asked; never against production without an explicit yes)
Dashboard: Worksheets tab -> Add worksheet -> pick the JSON and the PDF. Or from the shell, local dev:
`node .claude/skills/worksheet-from-markdown/scripts/upload.mjs http://localhost:8788 <parent PIN> OUT.json PAPER.pdf`
The script logs in, calls `POST /api/parent/worksheets` then `POST /api/parent/questions/import` with `worksheet_id`, and on any failure `DELETE`s the worksheet it just created. The week's plan must be published and its Match day open before the kid can play or hand in (see `docs/sessions-and-missions.md`). A `null` `set_date` means today.
