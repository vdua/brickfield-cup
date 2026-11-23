// Per-day time, score and skips, grouped by IST day.
import { all, istDay } from './util.js';
import { COUNTED } from './stats.js';

export async function dailyStats(db, days) {
	const rows = await all(db, `SELECT s.id, s.source, s.started_at, s.ended_at, s.duration_s, s.away_s, s.total,
      (SELECT COALESCE(SUM(time_ms),0) FROM attempts a WHERE a.session_id=s.id) att_ms,
      (SELECT COALESCE(SUM(correct),0) FROM attempts a WHERE a.session_id=s.id) correct,
      (SELECT COUNT(*) FROM attempts a WHERE a.session_id=s.id AND a.skipped=1) skipped,
      (SELECT COUNT(*) FROM attempts a WHERE a.session_id=s.id) answered,
      (CASE WHEN s.ended_at IS NULL OR ${COUNTED} THEN 1 ELSE 0 END) counted
    FROM sessions s ORDER BY s.id DESC LIMIT 1500`);
	const byDay = new Map();
	for (const r of rows) {
		const day = istDay(r.started_at);
		const d = byDay.get(day) || {
			day, sessions: 0, unfinished: 0, seconds: 0, correct: 0, total: 0, skipped: 0, paper_sessions: 0,
		};
		// a session abandoned before "finish" has no duration, so fall back to the per-question times
		const secs = r.ended_at ? Math.max(0, r.duration_s - r.away_s) : Math.round(r.att_ms / 1000);
		d.sessions += 1;
		if (!r.ended_at) d.unfinished += 1;
		if (r.source === 'paper') d.paper_sessions += 1;
		d.seconds += secs;
		if (r.counted) { // time counts for every sitting; score and skips only for the latest try of a worksheet
			d.correct += r.correct;
			d.total += r.total;
			d.skipped += r.skipped + (r.ended_at ? 0 : Math.max(0, r.total - r.answered));
		}
		byDay.set(day, d);
	}
	return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-days)
		.map((d) => ({ ...d, minutes: Math.round(d.seconds / 60) }));
}
