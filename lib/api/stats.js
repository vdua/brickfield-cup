import { STADIUM } from '../content.js';
import { all, one, istDay } from './util.js';

export async function playedDays(db) {
	const rows = await all(db, 'SELECT ended_at FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 400');
	return [...new Set(rows.map((r) => istDay(r.ended_at)))];
}
export async function totals(db) {
	const t = await one(db, 'SELECT COALESCE(SUM(s.runs),0) runs, COUNT(*) sessions, COALESCE(SUM(s.score),0) correct, COALESCE(SUM(s.total),0) balls FROM sessions s WHERE s.ended_at IS NOT NULL');
	const spent = await one(db, "SELECT COALESCE(SUM(cost),0) s FROM rewards WHERE status IN ('requested','approved')");
	const bonus = await one(db, 'SELECT COALESCE(SUM(runs),0) n FROM daily_bonus');
	const runs = t.runs + bonus.n;
	return { ...t, runs, bonus: bonus.n, spent: spent.s, wallet: runs - spent.s };
}
export const stageFor = (runs) => STADIUM.reduce((acc, s, i) => (runs >= s.runs ? i : acc), 0);
