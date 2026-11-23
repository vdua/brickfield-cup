import { ROADMAP } from '../content.js';
import { all } from './util.js';

export async function getSettings(db) {
	return Object.fromEntries((await all(db, 'SELECT key, value FROM settings')).map((r) => [r.key, r.value]));
}
export function currentWeek(s) {
	const o = Number(s.week_override || 0);
	if (o > 0) return Math.min(o, ROADMAP.length);
	const start = new Date(`${s.start_date || '2026-11-23'}T00:00:00+05:30`).getTime();
	const w = Math.floor((Date.now() - start) / (7 * 864e5)) + 1;
	return Math.max(1, Math.min(ROADMAP.length, w));
}
