---
name: weekly-content
description: Create next week's SASMO prep content for the Brickfield Cup app (30 questions plus 3-5 concept cards plus a parent guide) from a book chapter name, scanned book pages and/or sample questions. Use when the user says "create week N content", "next week's questions", "generate concept cards", or hands over book pages/images for a week.
---

# Weekly content generator

Builds one week of content for the kid (questions) and the parent (concept cards, teaching notes). Worksheets (the 25-question Sunday paper) are NOT part of this skill.

Read first: `docs/sasmo-plan.md` (the plan), `docs/sessions-and-missions.md` (kinds), `lib/content.js` (`ROADMAP` gives the week's default topic).

## Inputs (ask for anything missing, once, in one message)
- **Week number.** Topic defaults to `ROADMAP[week-1].topic`; the user may override it (the plan adapts to Sunday's results).
- **Source**, any mix of: a chapter name; scanned page images (Read each image file); sample questions typed or pasted.
- Optional: links the user already vetted (YouTube, handouts) and the book title + chapter.

Puzzle questions use `w` = the week; the app serves this week's first and falls back to any-week (`w` 0) puzzles.

If the topic is "open" (week 1 style, no specific topic), mix the 12 diagnostic topics instead of 3-5 related concepts.

## What to produce (30 questions per week)
| Kind | Count | Used on | Notes |
| --- | --- | --- | --- |
| `before` | 6 | Saturday | Cover each concept; no teaching has happened yet. 3 multiple choice + 3 free-text |
| `practice` | 12 | Mon, Tue, Wed (4 each) | **All free-text.** Difficulty ramps: about 3 easy, 6 medium, 3 hard. The app picks 4 at random per session, so the ramp is not enforced per day |
| `puzzle` | 6 | Thursday, scored | Logic or word puzzles on the week's concepts; cricket, Lego and shopping themes. 3 multiple choice + 3 free-text |
| `after` | 6 | Sunday | Parallel to `before`: same concept, difficulty and answer format per slot, different numbers and context. 3 multiple choice + 3 free-text |

Every question has `w` = the week (never 0) and a concept id `c`. Cover every concept at least twice across practice, and once in each of before/after.

## Concepts (3-5 small related ideas)
Each concept card is short and parent-readable:
- `id` (kebab-case), `name`
- `summary`: one or two sentences, what the idea is
- `cue`: when to reach for it, phrased as the question the parent asks ("Which strategy did you use?")
- `trap`: the typical mistake
- `example`: one worked question with 2-4 steps and the answer

## Writing rules
- **Originals only.** Use book pages and samples to learn the concept, level and style. Do not copy book questions, wording or numbers. Write new ones.
- Grade 5, SASMO style: non-routine, multi-step, needs a strategy before calculation, but solvable on paper in about 3.6 minutes. Currency is ₹.
- One unambiguous answer. Same format for every week: `practice` is free-text only (a number or short text, no `o`); `before`, `after` and `puzzle` are a half-and-half mix (3 multiple choice, 3 free-text each). Multiple choice has `o` = 4 options and `a` = the index as a string, 0-based. Distractors must come from realistic mistakes (off-by-one, a forgotten step, the naive answer), never obviously silly, and must never be a second valid answer. Pair each `before` question with an `after` question of the same format.
- `m` is a one-line worked solution under about 140 characters, like the existing bank.
- `t` topic uses the existing names in `data/questions.json` where one fits; `d` is 1-3.
- Never invent links. Include only URLs the user supplied or that you fetched and confirmed load. Leave `free_help` empty otherwise.

## Verify before showing anything
1. Solve every question independently from scratch (use a Node snippet for arithmetic, counting and divisibility) and compare with your key. Fix or drop any mismatch.
2. Check each has exactly one correct answer, and that multiple-choice options contain no second valid answer.
3. Compare prompts against `data/questions.json` and drop near-duplicates.
4. Confirm the counts and the concept coverage above.
5. List any question you were unsure about instead of silently keeping it.

## Output (drafts only, never straight into the bank)
- `data/drafts/week-NN-questions.json`: array using the short keys `w,k,t,d,q,a,o,m` plus `c` (concept id). The `c` field is ignored by the app until a concept column exists.
- `data/drafts/week-NN-guide.json`:
  ```json
  { "week": 2, "topic": "...", "concepts": [ {id, name, summary, cue, trap, example} ],
    "saturday_script": ["2-3 worked examples for the parent to teach, then 8-10 guided practice prompts"],
    "book": { "title": "", "chapter": "" }, "free_help": [ { "title": "", "url": "", "note": "" } ],
    "parent_notes": "what to watch for this week" }
  ```
Then print a short summary: counts per kind, concepts, flagged doubts, and what the parent must check.

## After the parent approves
Append the questions to `data/questions.json`, run `npm run seed:build` and `npm test`, and delete the drafts. Do not edit `seed.sql` by hand. Per `AGENTS.md`, work on a branch and raise a PR; never commit to `main`.
