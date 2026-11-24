// Weekly worksheets (the Saturday Match): parent upload (questions + printable PDF with OMR sheet), kid download, and OMR-style submission.
import { json, fail, all, one, run, nowIso, istDay } from './util.js';
import { cleanQ, INSERT_Q, normImport } from './clean-question.js';
import { publicQ } from './answers.js';
import { sheetQuestions, submitWorksheet } from './worksheet-play.js';

const MAX_PDF_B64 = 1_800_000; // D1 rows are capped at 2 MB

const summary = (w) => ({
	id: w.id,
	title: w.title,
	set_date: w.set_date,
	week: w.week,
	questions: w.questions,
	has_pdf: !!w.has_pdf,
	mode: w.mode,
	time_limit_min: w.time_limit_min,
	in_progress: !!w.in_progress,
	done_session: w.done_session || null,
	score: w.done_session ? w.done_score : null,
	total: w.done_session ? w.done_total : null,
	late: w.done_session ? !!w.done_late : null,
});

async function listWorksheets(db, limit) {
	return all(db, `SELECT w.*, (SELECT COUNT(*) FROM questions q WHERE q.worksheet_id=w.id AND q.active=1) questions,
      EXISTS (SELECT 1 FROM worksheet_files f WHERE f.worksheet_id=w.id) has_pdf,
      EXISTS (SELECT 1 FROM sessions s WHERE s.worksheet_id=w.id AND s.ended_at IS NULL) in_progress,
      (SELECT s.id FROM sessions s WHERE s.worksheet_id=w.id AND s.ended_at IS NOT NULL ORDER BY s.id DESC LIMIT 1) done_session,
      (SELECT s.score FROM sessions s WHERE s.worksheet_id=w.id AND s.ended_at IS NOT NULL ORDER BY s.id DESC LIMIT 1) done_score,
      (SELECT s.total FROM sessions s WHERE s.worksheet_id=w.id AND s.ended_at IS NOT NULL ORDER BY s.id DESC LIMIT 1) done_total,
      (SELECT s.late FROM sessions s WHERE s.worksheet_id=w.id AND s.ended_at IS NOT NULL ORDER BY s.id DESC LIMIT 1) done_late
    FROM worksheets w WHERE w.active=1 ORDER BY w.set_date DESC, w.id DESC LIMIT ?`, limit);
}

export async function worksheetParentRoutes({ db, method, body, seg }) {
	if (seg[1] !== 'worksheets') return null;
	if (!seg[2] && method === 'POST') {
		const title = String(body.title || '').trim().slice(0, 120);
		const setDate = String(body.set_date || istDay(nowIso()));
		if (!title) return fail(400, 'Give the worksheet a title');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(setDate)) return fail(400, 'set_date must look like 2026-11-24');
		if (!Array.isArray(body.questions) || !body.questions.length) return fail(400, 'Send { questions: [...] }');
		if (body.pdf_base64 && String(body.pdf_base64).length > MAX_PDF_B64) return fail(413, 'PDF is too big (limit about 1.3 MB). Compress it or drop images.');
		let rows;
		try { rows = body.questions.map((q) => cleanQ({ ...normImport(q), kind: 'worksheet', week: body.week })); } catch (e) { return fail(400, e.message); }
		const week = Number(body.week) || 0;
		const mode = body.mode === 'paper' ? 'paper' : 'screen';
		const rawLimit = body.time_limit_min ?? null;
		const limit = rawLimit === null ? null : Math.round(Number(rawLimit));
		if (limit !== null && !(limit >= 1 && limit <= 240)) return fail(400, 'time_limit_min must be between 1 and 240 minutes');
		const w = await run(db, 'INSERT INTO worksheets(title, set_date, week, mode, time_limit_min, created_at) VALUES (?,?,?,?,?,?)', title, setDate, week, mode, limit, nowIso());
		const id = w.meta?.last_row_id;
		await db.batch(rows.map((v) => db.prepare(INSERT_Q).bind(...v.slice(0, 8), id)));
		if (body.pdf_base64) await run(db, 'INSERT INTO worksheet_files(worksheet_id, pdf_base64) VALUES (?, ?)', id, String(body.pdf_base64));
		return json({
			id, questions: rows.length, has_pdf: !!body.pdf_base64, mode, time_limit_min: limit,
		});
	}
	if (seg[2] && seg[3] === 'pdf' && method === 'POST') {
		const b64 = String(body.pdf_base64 || '');
		if (!b64 || b64.length > MAX_PDF_B64) return fail(400, 'Send pdf_base64 (under about 1.3 MB)');
		if (!(await one(db, 'SELECT id FROM worksheets WHERE id=?', Number(seg[2])))) return fail(404, 'Not found');
		await run(db, 'INSERT INTO worksheet_files(worksheet_id, pdf_base64) VALUES (?, ?) ON CONFLICT(worksheet_id) DO UPDATE SET pdf_base64=excluded.pdf_base64', Number(seg[2]), b64);
		return json({ ok: true });
	}
	if (seg[2] && !seg[3] && method === 'DELETE') {
		await run(db, 'UPDATE worksheets SET active=0 WHERE id=?', Number(seg[2]));
		await run(db, 'UPDATE questions SET active=0 WHERE worksheet_id=?', Number(seg[2]));
		return json({ ok: true });
	}
	return null;
}

export async function worksheetKidRoutes({ db, method, body, seg }) {
	if (seg[0] !== 'worksheets') return null;
	if (!seg[1] && method === 'GET') return json((await listWorksheets(db, 30)).map(summary));

	const id = Number(seg[1]);
	const w = await one(db, 'SELECT * FROM worksheets WHERE id=? AND active=1', id);
	if (!w) return fail(404, 'No such worksheet');

	if (seg[2] === 'pdf' && method === 'GET') {
		const f = await one(db, 'SELECT pdf_base64 FROM worksheet_files WHERE worksheet_id=?', id);
		if (!f) return fail(404, 'This worksheet has no PDF');
		const bin = atob(f.pdf_base64);
		const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
		const name = `${w.set_date}-${w.title}`.replace(/[^A-Za-z0-9._-]+/g, '-');
		return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${name}.pdf"`, 'cache-control': 'private, max-age=300' } });
	}
	if (!seg[2] && method === 'GET') {
		const qs = await sheetQuestions(db, id);
		const done = await one(db, 'SELECT id FROM sessions WHERE worksheet_id=? AND ended_at IS NOT NULL ORDER BY id DESC LIMIT 1', id);
		return json({
			worksheet: {
				id: w.id,
				title: w.title,
				set_date: w.set_date,
				week: w.week,
				mode: w.mode,
				time_limit_min: w.time_limit_min,
			},
			questions: qs.map(publicQ),
			done_session: done?.id || null,
		});
	}

	if (seg[2] === 'submit' && method === 'POST') return submitWorksheet({ db, w, body }); // answers = { "<question_id>": "<option index or typed answer>" | null }
	return null;
}
