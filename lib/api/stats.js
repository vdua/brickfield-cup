import { STADIUM } from "../content.js";
import { all, one, istDay, nowIso } from "./util.js";

export function streakFrom(days) {
  const set = new Set(days);
  let d = istDay(nowIso());
  if (!set.has(d)) d = istDay(new Date(Date.now() - 864e5).toISOString()); // today not played yet: count up to yesterday
  let n = 0;
  while (set.has(d)) {
    n++;
    d = new Date(new Date(`${d}T00:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);
  }
  return n;
}
export async function playedDays(db) {
  const rows = await all(db, "SELECT ended_at FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 400");
  return [...new Set(rows.map((r) => istDay(r.ended_at)))];
}
// A worksheet can be repeated; only its most recent finished session counts towards runs and scores.
export const COUNTED = "(s.worksheet_id IS NULL OR s.id = (SELECT MAX(s2.id) FROM sessions s2 WHERE s2.worksheet_id=s.worksheet_id AND s2.ended_at IS NOT NULL))";
export async function totals(db) {
  const t = await one(db, `SELECT COALESCE(SUM(s.runs),0) runs, COUNT(*) sessions, COALESCE(SUM(s.score),0) correct, COALESCE(SUM(s.total),0) balls FROM sessions s WHERE s.ended_at IS NOT NULL AND ${COUNTED}`);
  const spent = await one(db, "SELECT COALESCE(SUM(cost),0) s FROM rewards WHERE status IN ('requested','approved')");
  return { ...t, spent: spent.s, wallet: t.runs - spent.s };
}
export const stageFor = (runs) => STADIUM.reduce((acc, s, i) => (runs >= s.runs ? i : acc), 0);
