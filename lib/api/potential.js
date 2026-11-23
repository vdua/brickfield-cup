// Most runs a week can earn if every answer is right, for the parent to size rewards against.
import { ROADMAP, MISSION, RUNS_FOR } from "../content.js";
import { all } from "./util.js";
import { restRules, BONUS_MAX } from "./streak.js";

const val = (d) => RUNS_FOR[d] || 4;
const sum = (xs) => xs.reduce((a, x) => a + x, 0);

// Lowest and highest total when `n` questions are drawn: this week's pool first, then the fallback pool.
function range(primary, fallback, n) {
  const take = (list, k, dir) => [...list].sort((a, b) => dir * (a - b)).slice(0, k);
  const k = Math.min(n, primary.length), rest = Math.min(n - k, fallback.length);
  return {
    n: k + rest,
    min: sum(take(primary, k, 1)) + sum(take(fallback, rest, 1)),
    max: sum(take(primary, k, -1)) + sum(take(fallback, rest, -1)),
  };
}

export async function weekPotential(db, week) {
  const road = ROADMAP[week - 1];
  if (!road) return null;
  const qs = await all(db, "SELECT kind, week, difficulty FROM questions WHERE active=1 AND worksheet_id IS NULL AND week IN (0, ?, ?)", week, Math.max(week - 1, 1));
  const pool = (kind, wk) => qs.filter((q) => q.kind === kind && q.week === wk).map((q) => val(q.difficulty));
  const need = (kind) => MISSION.find((m) => m.kind === kind);
  const parts = [
    { label: "Saturday before-check", ...range(pool("before", week), [], 99) },
    { label: "Mon–Wed practice", ...range(pool("practice", week), [...pool("practice", week - 1), ...pool("practice", 0)], need("practice").need * 4) },
    { label: "Thursday puzzle", ...range(pool("puzzle", week), pool("puzzle", 0), 6) },
    { label: "Sunday after-check", ...range(pool("after", week), [], 99) },
  ];
  const sheets = await all(db, "SELECT q.difficulty FROM worksheets w JOIN questions q ON q.worksheet_id=w.id WHERE w.active=1 AND w.week=?", week);
  if (sheets.length) parts.push({ label: "Sunday worksheet", n: sheets.length, min: sum(sheets.map((s) => val(s.difficulty))), max: sum(sheets.map((s) => val(s.difficulty))) });
  // regularity bonus: one per working day of the week; fresh streak ramps 1, 2, ... up to the cap, a streak already at the cap pays the cap every day
  const { restReason } = await restRules(db);
  let days = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(new Date(`${road.start}T00:00:00Z`).getTime() + i * 864e5).toISOString().slice(0, 10);
    if (!restReason(d)) days += 1;
  }
  const bonus = { days, min: sum(Array.from({ length: days }, (_, i) => Math.min(i + 1, BONUS_MAX))), max: days * BONUS_MAX };
  const hasQuestions = qs.some((q) => q.week === week); // only revision-style fallbacks from earlier weeks do not count
  return { week, topic: road.topic, hasQuestions, parts, bonus, total: { min: sum(parts.map((p) => p.min)) + bonus.min, max: sum(parts.map((p) => p.max)) + bonus.max } };
}
