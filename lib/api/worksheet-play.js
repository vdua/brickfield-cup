// Playing a worksheet (on screen or on paper): all answers are held in a draft and marked together when handed in.
import { RUNS_FOR } from '../content.js';
import {
	json, fail, all, one, run, nowIso, istDay,
} from './util.js';
import { isCorrect, displayAnswer, publicQ } from './answers.js';
import { restToday } from './streak.js';
import { slotForSheet } from './slots.js';
import { totals } from './stats.js';
import { settleSession, outcome } from './finish.js';

const MAX_MINUTES = 240; // the longest sitting that counts as playing time

export const sheetQuestions = (db, id) => all(db, 'SELECT * FROM questions WHERE worksheet_id=? AND active=1 ORDER BY id', id);

export function markAnswers(qs, given) {
	return qs.map((q) => {
		const g = String(given[q.id] ?? '').trim().slice(0, 200);
		const correct = isCorrect(q, g);
		return {
			q, g, skipped: g === '' ? 1 : 0, correct: correct ? 1 : 0, runs: correct ? RUNS_FOR[q.difficulty] || 4 : 0,
		};
	});
}

// PUT /api/session/:id/draft { answers }: save what has been typed so far (replaces the previous draft).
export async function draftRoutes({ db, method, body, seg }) {
	if (seg[0] !== 'session' || seg[2] !== 'draft' || method !== 'PUT') return null;
	const sess = await one(db, 'SELECT * FROM sessions WHERE id=?', Number(seg[1]));
	if (!sess || sess.kind !== 'worksheet') return fail(404, 'No such worksheet session');
	if (sess.ended_at) return fail(409, 'This worksheet is already handed in');
	if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return fail(400, 'Send { answers: { "<question_id>": "..." } }');
	const ids = JSON.parse(sess.question_ids).map(String);
	const kept = Object.fromEntries(Object.entries(body.answers).filter(([k]) => ids.includes(k)).map(([k, v]) => [k, String(v ?? '').slice(0, 200)]));
	await run(
		db,
		'INSERT INTO worksheet_drafts(session_id, answers, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET answers=excluded.answers, updated_at=excluded.updated_at',
		sess.id,
		JSON.stringify(kept),
		nowIso(),
	);
	return json({ ok: true, saved: Object.keys(kept).length });
}

// An unfinished worksheet session picked up again (maybe on another device): the clock keeps the real start, and every
// question comes back with the draft, so nothing is lost.
export async function resumeWorksheet(db, s) {
	const draft = await one(db, 'SELECT answers FROM worksheet_drafts WHERE session_id=?', s.id);
	return {
		session: {
			id: s.id, kind: s.kind, week: s.week, slot: s.slot, started_at: s.started_at, worksheet_id: s.worksheet_id,
		},
		questions: (await sheetQuestions(db, s.worksheet_id)).map(publicQ),
		draft: draft ? JSON.parse(draft.answers) : {},
		prior: [],
		parSec: 180,
	};
}

// POST /api/worksheets/:id/submit { answers, session_id?, minutes? }
// With a session_id (from /session/start) that session is finished; without one a paper session is created from the
// typed minutes. Either way a worksheet is handed in once, and runs are paid here, never per answer.
export async function submitWorksheet({ db, w, body }) {
	const rest = await restToday(db);
	if (rest) return fail(403, `No innings today (${rest}). Submit it on the next working day.`);
	const qs = await sheetQuestions(db, w.id);
	if (!qs.length) return fail(404, 'This worksheet has no questions');
	const handedIn = await one(db, 'SELECT id FROM sessions WHERE worksheet_id=? AND ended_at IS NOT NULL LIMIT 1', w.id);
	if (handedIn) return fail(409, 'You already handed in this worksheet.');
	const before = await totals(db);
	const ended = nowIso();
	let sess;
	let duration;
	if (body.session_id) {
		sess = await one(db, "SELECT * FROM sessions WHERE id=? AND worksheet_id=? AND kind='worksheet'", Number(body.session_id), w.id);
		if (!sess) return fail(404, 'No such worksheet session');
		const elapsed = Math.round((new Date(ended) - new Date(sess.started_at)) / 1000);
		duration = Math.min(MAX_MINUTES * 60, Math.max(0, elapsed));
	} else {
		const sl = await slotForSheet(db, w, istDay(ended)); // the Saturday Match: today or missed, never ahead
		if (sl.error) return fail(sl.code, sl.error);
		const minutes = Math.max(0, Math.min(MAX_MINUTES, Number(body.minutes) || 0));
		duration = Math.round(minutes * 60);
		const started = new Date(new Date(ended).getTime() - duration * 1000).toISOString();
		const s = await run(
			db,
			"INSERT INTO sessions(kind, week, question_ids, started_at, total, source, worksheet_id, slot) VALUES ('worksheet', ?, ?, ?, ?, 'paper', ?, ?)",
			w.week,
			JSON.stringify(qs.map((q) => q.id)),
			started,
			qs.length,
			w.id,
			sl.slot,
		);
		sess = await one(db, 'SELECT * FROM sessions WHERE id=?', s.meta?.last_row_id);
	}
	const given = body.answers && typeof body.answers === 'object' ? body.answers : {};
	const marked = markAnswers(qs, given);
	const per = duration ? Math.round((duration * 1000) / qs.length) : 0;
	await db.batch(marked.map((m) => db.prepare('INSERT INTO attempts(session_id, question_id, given, correct, time_ms, runs, skipped, created_at) VALUES (?,?,?,?,?,?,?,?)')
		.bind(sess.id, m.q.id, m.skipped ? null : m.g, m.correct, per, m.runs, m.skipped, ended)));
	const done = await settleSession(db, sess, { ended, duration });
	await run(db, 'DELETE FROM worksheet_drafts WHERE session_id=?', sess.id);
	return json(outcome(before, await totals(db), {
		session_id: sess.id,
		bonus: done.bonus,
		score: done.score,
		total: qs.length,
		runs: done.runs,
		skipped: marked.filter((m) => m.skipped).length,
		newBadges: done.newBadges,
		review: marked.map((m) => ({
			question_id: m.q.id,
			given: m.skipped ? null : m.g,
			correct: !!m.correct,
			skipped: !!m.skipped,
			answer: displayAnswer(m.q),
			method: m.q.method,
		})),
	}));
}
