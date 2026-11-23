// Regularity streak: one bonus per working day (1, 2, ... capped at BONUS_MAX runs).
// A missed working day resets it. Rest weekdays (default Friday) and parent-set holidays
// are not working days: nothing can be played on them and they never break the streak.
// Every WICKETS_PER_RESET wickets (wrong or skipped answers) also reset it.
import { all, one, run, istDay, nowIso } from "./util.js";

export const BONUS_MAX = 6;
export const WICKETS_PER_RESET = 10;
const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const weekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Sunday ... 5 = Friday

// restReason(day) returns why the day is not a working day, or null.
export async function restRules(db) {
  const s = await one(db, "SELECT value FROM settings WHERE key='rest_days'");
  const weekdays = (s ? s.value : "5").split(",").filter((x) => x.trim() !== "").map(Number);
  const holidays = new Map((await all(db, "SELECT day, note FROM holidays")).map((h) => [h.day, h.note || "holiday"]));
  const restReason = (d) => (holidays.has(d) ? `holiday: ${holidays.get(d)}` : weekdays.includes(weekday(d)) ? "rest day" : null);
  return { restReason };
}

const missedWorkingDay = (restReason, from, to) => {
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) if (!restReason(d)) return true;
  return false;
};

// sessions: [{ day, wickets }] oldest first. Pure, so it can be tested without a database.
export function replay(sessions, restReason, today) {
  let streak = 0, wick = 0, last = null;
  const dayBonus = new Map();
  for (const { day, wickets } of sessions) {
    if (restReason(day)) continue;
    if (day !== last) {
      if (last && missedWorkingDay(restReason, last, day)) streak = 0;
      streak += 1;
      dayBonus.set(day, Math.min(streak, BONUS_MAX));
      last = day;
    }
    wick += wickets;
    while (wick >= WICKETS_PER_RESET) { wick -= WICKETS_PER_RESET; streak = 0; }
  }
  const lapsed = last && last !== today && missedWorkingDay(restReason, last, today);
  const current = lapsed ? 0 : streak;
  const playedToday = last === today;
  return {
    streak: current, dayBonus, wicketsLeft: WICKETS_PER_RESET - wick,
    nextBonus: playedToday ? null : Math.min(current + 1, BONUS_MAX), playedToday,
  };
}

export async function streakState(db, today = istDay(nowIso())) {
  const { restReason } = await restRules(db);
  const rows = await all(db, "SELECT ended_at, wickets FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at, id");
  const st = replay(rows.map((r) => ({ day: istDay(r.ended_at), wickets: r.wickets })), restReason, today);
  return { ...st, rest: restReason(today) };
}

// The reason today is not a working day, or null. Used to block new sessions.
export async function restToday(db) {
  return (await restRules(db)).restReason(istDay(nowIso()));
}

// Pays the day's bonus once, on the first finished session of a working day. Returns { runs, streak }.
export async function awardBonus(db, endedAt) {
  const day = istDay(endedAt);
  const st = await streakState(db, day);
  const runs = st.dayBonus.get(day) || 0;
  if (!runs || await one(db, "SELECT 1 x FROM daily_bonus WHERE day=?", day)) return { runs: 0, streak: st.streak };
  await run(db, "INSERT INTO daily_bonus(day, runs, created_at) VALUES (?, ?, ?)", day, runs, endedAt);
  return { runs, streak: st.streak };
}
