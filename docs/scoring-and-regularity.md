# Scoring, regularity bonus and rest days

## Runs per answer
A correct answer earns runs by difficulty: easy 2, medium 4, hard 6 (`RUNS_FOR` in `lib/content.js`). A wrong or skipped answer earns 0 and is a **wicket**. A session's runs are the sum of its answers. Total runs grow the stadium; total minus pending/approved reward costs is the wallet. Badges give recognition, not runs. Only a worksheet's latest finished attempt counts.

## Regularity bonus (`lib/api/streak.js`)
- Paid once per working day, on the first finished session of the day: day 1 of a streak 1 run, day 2 2 runs ... capped at **6** runs a day.
- Stored in `daily_bonus` (one row per day), so changing the rules later never rewrites past totals. Totals add it to session runs (`totals.bonus`).
- A missed **working** day resets the streak to 0. Rest days and holidays are not working days: they never break it.
- **Every 10 wickets reset the streak** (wickets accumulate across sessions, wrong or skipped answers, paper worksheets included). The reset happens right after the session that reaches 10; the day's bonus is already paid, and tomorrow starts again at 1.
- The streak is replayed from finished sessions, so adding a holiday for a past day protects the streak from then on. A bonus already paid is not clawed back or topped up.
- The streak badges (3, 7, 14 days) use this streak.

## Rest days and holidays
- Weekly rest day: setting `rest_days` (comma list of weekdays, 0 = Sunday ... 5 = Friday; default `5`; empty = none), edited in Parent > Settings.
- Holidays: table `holidays`, managed in Parent > Settings (`GET/POST /api/parent/holidays`, `DELETE /api/parent/holidays/:day`).
- On a rest day or holiday the kid cannot start a session or submit a paper worksheet (HTTP 403 with the reason). `/api/state` returns `regularity: { nextBonus, wicketsLeft, rest }`; the home screen shows a rest-day panel.

## This week's maximum (`lib/api/potential.js`)
`GET /api/parent/overview` returns `weekMax` for the current week: per part (Toss, Nets, Spin puzzle, Super over, and the Match worksheet if uploaded) the most runs it can give if every answer is right, shown as 0 to that maximum. Practice and puzzle questions are drawn at random, so the maximum assumes the hardest ones are drawn. Slots on a rest day or holiday are left out; missed missions stay in, because a catch-up session earns runs like any other (it only counts as a failed mission and cost him the streak day). `earned` is the runs from finished sessions this week.
The regularity bonus is `{ banked, max }`: what the days already played paid, up to what he can still bank by playing every remaining working day, continuing the streak he is on now (1, 2, ... capped at 6). Replay is not counted. A week with no questions loaded shows a message instead of a total.

## Existing databases
Run `migrations/2026-11-weekly-format.sql` against the live D1 **before** deploying this code (it is additive and safe to repeat; the new code reads `holidays`). It creates `holidays` and `daily_bonus`, adds the `rest_days` setting, and applies the week 1 question changes without duplicating anything:

```
npx wrangler d1 execute brickfield-db --remote --file=migrations/2026-11-weekly-format.sql
```
Do not re-run `seed.sql` on a live database. Test it first with `--local`.
