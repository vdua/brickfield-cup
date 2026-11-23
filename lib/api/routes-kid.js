// Public and kid-facing routes. Each returns a Response, or null when no route matches.
import { restToday, awardBonus } from './streak.js';
import { RUNS_FOR, MISTAKES, EVENT_TYPES, STADIUM } from '../content.js';
import { json, fail, all, one, run, nowIso, istDay } from './util.js';
import { safeEqual, sessionCookie } from './auth.js';
import { getSettings, currentWeek } from './settings.js';
import { isCorrect, displayAnswer, publicQ } from './answers.js';
import { resumeUnfinished } from './resume.js';
import { totals, stageFor } from './stats.js';
import { pick } from './pick.js';
import { awardBadges } from './badges.js';
import { kidState } from './kid-state.js';
import { worksheetKidRoutes } from './worksheets.js';
import { GATED, slotForStart } from './slots.js';

export async function publicRoutes({ env, db, path, method, body, secure }) {
	if (path === '/login' && method === 'POST') {
		const since = new Date(Date.now() - 15 * 60000).toISOString();
		const fails = await one(db, "SELECT COUNT(*) n FROM events WHERE type='login_fail' AND created_at > ?", since);
		if (fails.n >= 8) return fail(429, 'Too many wrong PINs. Wait 15 minutes.');
		const role = body.role === 'parent' ? 'parent' : 'kid';
		const expected = role === 'parent' ? env.PARENT_PIN : env.KID_PIN;
		if (!expected || !safeEqual(String(body.pin || ''), String(expected))) {
			await run(db, "INSERT INTO events(type, detail, created_at) VALUES ('login_fail', ?, ?)", role, nowIso());
			return fail(401, 'Wrong PIN');
		}
		await run(db, "INSERT INTO events(type, detail, created_at) VALUES ('login', ?, ?)", role, nowIso());
		return json({ ok: true, role }, 200, { 'set-cookie': await sessionCookie(role, env, secure) });
	}
	if (path === '/logout' && method === 'POST') {
		return json({ ok: true }, 200, { 'set-cookie': 'bc_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' });
	}
	return null;
}

export async function kidRoutes({ db, path, method, body, seg }) {
	if (path === '/state' && method === 'GET') return json(await kidState(db));
	const sheet = await worksheetKidRoutes({ db, method, body, seg });
	if (sheet) return sheet;

	if (path === '/session/start' && method === 'POST') {
		const rest = await restToday(db);
		if (rest) return fail(403, `No innings today (${rest}). Back on the next working day!`);
		const kinds = ['practice', 'before', 'after', 'puzzle', 'revision', 'diagnostic', 'mock', 'worksheet'];
		const kind0 = kinds.includes(body.kind) ? body.kind : 'practice';
		const s = await getSettings(db);
		let kind = kind0; let week = Number(body.week) || currentWeek(s); let wsId = null; let
			slot = null;
		if (GATED.has(kind0)) { // this week's missions only open on their day, one a day
			const g = await slotForStart(db, body, istDay(nowIso()), currentWeek(s));
			if (g.error) return fail(g.code, g.error);
			({ kind, week, slot } = g); wsId = g.worksheetId;
			const again = await resumeUnfinished(db, week, slot); // retired earlier: carry on with the same innings
			if (again) return json(again);
		}
		const qs = await pick(db, kind, week, wsId);
		if (!qs.length) return fail(404, kind === 'revision' ? 'No mistakes to replay. Nice batting!' : 'No questions here yet. Ask Dad to add some in the dashboard!');
		const started = nowIso();
		const r = await run(db, 'INSERT INTO sessions(kind, week, question_ids, started_at, total, worksheet_id, slot) VALUES (?, ?, ?, ?, ?, ?, ?)', kind, week, JSON.stringify(qs.map((q) => q.id)), started, qs.length, wsId, slot);
		const id = r.meta?.last_row_id;
		await run(db, "INSERT INTO events(type, detail, session_id, created_at) VALUES ('session_start', ?, ?, ?)", kind, id, started);
		return json({ session: { id, kind, week, slot, started_at: started }, questions: qs.map(publicQ), parSec: kind === 'diagnostic' || kind === 'mock' ? 216 : 180 });
	}

	if (seg[0] === 'session' && seg[1] && seg[2] === 'answer' && method === 'POST') {
		const sid = Number(seg[1]);
		const sess = await one(db, 'SELECT * FROM sessions WHERE id=?', sid);
		if (!sess) return fail(404, 'No such session');
		if (sess.ended_at) return fail(409, 'This innings is already over');
		const qid = Number(body.question_id);
		if (!JSON.parse(sess.question_ids).includes(qid)) return fail(400, 'That question is not in this innings');
		if (await one(db, 'SELECT id FROM attempts WHERE session_id=? AND question_id=?', sid, qid)) return fail(409, 'Already answered');
		const q = await one(db, 'SELECT * FROM questions WHERE id=?', qid);
		const correct = isCorrect(q, body.given);
		const runs = correct ? RUNS_FOR[q.difficulty] || 4 : 0;
		const r = await run(
			db,
			'INSERT INTO attempts(session_id, question_id, given, correct, time_ms, runs, skipped, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
			sid,
			qid,
			String(body.given ?? '').slice(0, 200),
			correct ? 1 : 0,
			Math.max(0, Math.min(3600000, Number(body.time_ms) || 0)),
			runs,
			String(body.given ?? '').trim() === '' ? 1 : 0,
			nowIso(),
		);
		return json({ attempt_id: r.meta?.last_row_id, correct, runs, answer: displayAnswer(q), method: q.method });
	}

	if (seg[0] === 'attempt' && seg[1] && seg[2] === 'mistake' && method === 'POST') {
		if (!MISTAKES.includes(body.type)) return fail(400, 'Unknown mistake type');
		await run(db, 'UPDATE attempts SET mistake=? WHERE id=? AND correct=0', body.type, Number(seg[1]));
		return json({ ok: true });
	}

	if (seg[0] === 'session' && seg[1] && seg[2] === 'finish' && method === 'POST') {
		const sid = Number(seg[1]);
		const sess = await one(db, 'SELECT * FROM sessions WHERE id=?', sid);
		if (!sess) return fail(404, 'No such session');
		const before = await totals(db);
		if (!sess.ended_at) {
			const ended = nowIso();
			// questions never answered count as skipped, so every question has a row
			const seen = new Set((await all(db, 'SELECT question_id FROM attempts WHERE session_id=?', sid)).map((a) => a.question_id));
			const missing = JSON.parse(sess.question_ids).filter((qid) => !seen.has(qid));
			if (missing.length) await db.batch(missing.map((qid) => db.prepare('INSERT INTO attempts(session_id, question_id, given, correct, time_ms, runs, skipped, created_at) VALUES (?, ?, NULL, 0, 0, 0, 1, ?)').bind(sid, qid, ended)));
			const atts = await all(db, 'SELECT * FROM attempts WHERE session_id=? ORDER BY id', sid);
			const score = atts.filter((a) => a.correct).length;
			const runs = atts.reduce((a, x) => a + x.runs, 0);
			const duration = Math.round((new Date(ended) - new Date(sess.started_at)) / 1000);
			const away = Math.max(0, Math.min(duration, Number(body.away_s) || 0));
			await run(
				db,
				'UPDATE sessions SET ended_at=?, score=?, runs=?, wickets=?, duration_s=?, away_s=?, away_count=? WHERE id=?',
				ended,
				score,
				runs,
				atts.length - score,
				duration,
				away,
				Number(body.away_count) || 0,
				sid,
			);
			await run(db, "INSERT INTO events(type, detail, session_id, created_at) VALUES ('session_end', ?, ?, ?)", `${score}/${sess.total}`, sid, ended);
			const updated = await one(db, 'SELECT * FROM sessions WHERE id=?', sid);
			const bonus = await awardBonus(db, ended);
			const fresh = await awardBadges(db, updated, atts);
			const after = await totals(db);
			return json({ session: updated, bonus, newBadges: fresh, totals: after, stageBefore: stageFor(before.runs), stageAfter: stageFor(after.runs), stages: STADIUM });
		}
		return json({ session: sess, newBadges: [], totals: before, stageBefore: stageFor(before.runs), stageAfter: stageFor(before.runs), stages: STADIUM });
	}

	if (path === '/event' && method === 'POST') {
		if (!EVENT_TYPES.includes(body.type)) return fail(400, 'Unknown event');
		await run(db, 'INSERT INTO events(type, detail, session_id, created_at) VALUES (?, ?, ?, ?)', body.type, String(body.detail ?? '').slice(0, 200), body.session_id || null, nowIso());
		return json({ ok: true });
	}

	if (seg[0] === 'messages' && seg[1] && method === 'POST') {
		const id = Number(seg[1]);
		if (seg[2] === 'seen') await run(db, 'UPDATE messages SET seen_at=COALESCE(seen_at, ?) WHERE id=?', nowIso(), id);
		if (seg[2] === 'react') await run(db, 'UPDATE messages SET reaction=?, seen_at=COALESCE(seen_at, ?) WHERE id=?', String(body.reaction || '').slice(0, 16), nowIso(), id);
		return json({ ok: true });
	}

	if (seg[0] === 'rewards' && seg[1] && seg[2] === 'request' && method === 'POST') {
		const rw = await one(db, 'SELECT * FROM rewards WHERE id=?', Number(seg[1]));
		if (!rw || rw.status !== 'available') return fail(400, "That reward isn't available");
		const t = await totals(db);
		if (t.wallet < rw.cost) return fail(400, `You need ${rw.cost - t.wallet} more runs`);
		await run(db, "UPDATE rewards SET status='requested', requested_at=? WHERE id=?", nowIso(), rw.id);
		return json({ ok: true });
	}
	return null;
}
