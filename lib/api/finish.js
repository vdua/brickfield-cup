// Shared end of an innings, used by /session/:id/finish and the worksheet submit:
// skipped rows for unreached questions, session totals, the session_end event, the daily bonus and badges.
import { STADIUM } from '../content.js';
import { all, one, run, nowIso } from './util.js';
import { awardBonus } from './streak.js';
import { awardBadges } from './badges.js';
import { stageFor } from './stats.js';

const SKIP_ROW = 'INSERT INTO attempts(session_id, question_id, given, correct, time_ms, runs, skipped, created_at) VALUES (?, ?, NULL, 0, 0, 0, 1, ?)';

// duration (seconds) defaults to the time since the session started
export async function settleSession(db, sess, {
	ended = nowIso(), duration, away_s: awayS, away_count: awayCount,
} = {}) {
	const sid = sess.id;
	const seen = new Set((await all(db, 'SELECT question_id FROM attempts WHERE session_id=?', sid)).map((a) => a.question_id));
	const missing = JSON.parse(sess.question_ids).filter((qid) => !seen.has(qid));
	if (missing.length) await db.batch(missing.map((qid) => db.prepare(SKIP_ROW).bind(sid, qid, ended)));
	const atts = await all(db, 'SELECT * FROM attempts WHERE session_id=? ORDER BY id', sid);
	const score = atts.filter((a) => a.correct).length;
	const runs = atts.reduce((a, x) => a + x.runs, 0);
	const secs = duration ?? Math.round((new Date(ended) - new Date(sess.started_at)) / 1000);
	const away = Math.max(0, Math.min(secs, Number(awayS) || 0));
	await run(
		db,
		'UPDATE sessions SET ended_at=?, score=?, runs=?, wickets=?, duration_s=?, away_s=?, away_count=? WHERE id=?',
		ended,
		score,
		runs,
		atts.length - score,
		secs,
		away,
		Number(awayCount) || 0,
		sid,
	);
	const note = sess.source === 'paper' ? ' paper' : '';
	await run(db, "INSERT INTO events(type, detail, session_id, created_at) VALUES ('session_end', ?, ?, ?)", `${score}/${sess.total}${note}`, sid, ended);
	const session = await one(db, 'SELECT * FROM sessions WHERE id=?', sid);
	const bonus = await awardBonus(db, ended);
	const newBadges = await awardBadges(db, session, atts);
	return {
		session, atts, score, runs, bonus, newBadges,
	};
}

// Totals and stadium stage before and after, for the end-of-innings screen.
export const outcome = (before, after, extra) => ({
	...extra,
	totals: after,
	stageBefore: stageFor(before.runs),
	stageAfter: stageFor(after.runs),
	stages: STADIUM,
});
