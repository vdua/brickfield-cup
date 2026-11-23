import { ROADMAP, BADGES, STADIUM } from "../content.js";
import { all, one, istDay, nowIso } from "./util.js";
import { getSettings, currentWeek } from "./settings.js";
import { playedDays, totals, stageFor } from "./stats.js";
import { streakState } from "./streak.js";
import { weekSlots } from "./slots.js";

export async function kidState(db) {
  const s = await getSettings(db);
  const week = currentWeek(s);
  const t = await totals(db);
  const days = await playedDays(db);
  const reg = await streakState(db);
  const earned = Object.fromEntries((await all(db, "SELECT code, earned_at FROM badges")).map((r) => [r.code, r.earned_at]));
  const today = istDay(nowIso());
  const plan = await weekSlots(db, week, today);
  // slots he missed last week (e.g. Sunday's Super over) can still be caught up on
  const carry = week > 1 ? (await weekSlots(db, week - 1, today)).slots.filter((x) => x.status === "missed").map((x) => ({ ...x, week: week - 1 })) : [];
  const replay = await one(db, "SELECT COUNT(*) n, MAX(score) best, MAX(total) total FROM sessions WHERE week=? AND kind='revision' AND ended_at IS NOT NULL", week);
  const recent = await all(db, "SELECT id, kind, week, score, total, runs, wickets, duration_s, ended_at FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 6");
  const todayRows = await all(db, "SELECT duration_s, away_s, ended_at FROM sessions WHERE ended_at IS NOT NULL AND ended_at >= ?", new Date(Date.now() - 2 * 864e5).toISOString());
  const todayMin = Math.round(todayRows.filter((r) => istDay(r.ended_at) === today).reduce((a, r) => a + Math.max(0, r.duration_s - r.away_s), 0) / 60);
  const message = await one(db, "SELECT id, body, created_at, seen_at, reaction FROM messages ORDER BY id DESC LIMIT 1");
  const rewards = await all(db, "SELECT id, title, cost, status FROM rewards WHERE status != 'archived' ORDER BY cost");
  const stage = stageFor(t.runs);
  return {
    player: s.player_name || "Captain", team: s.team_name || "Brickers",
    week, roadmap: ROADMAP, thisWeek: ROADMAP[week - 1], plan, carry, replay,
    totals: t, streak: reg.streak, playedToday: days.includes(today),
    regularity: { nextBonus: reg.nextBonus, wicketsLeft: reg.wicketsLeft, rest: reg.rest },
    todayMin, goalMin: Number(s.daily_goal_min || 30),
    badges: BADGES.map((b) => ({ ...b, earned_at: earned[b.code] || null })),
    stadium: { stage, stages: STADIUM, next: STADIUM[stage + 1] || null },
    recent, message, rewards,
  };
}
