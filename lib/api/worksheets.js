// Sunday worksheets: parent upload (questions + printable PDF with OMR sheet), kid download, and OMR-style submission.
import { RUNS_FOR } from "../content.js";
import { json, fail, all, one, run, nowIso, istDay } from "./util.js";
import { cleanQ, INSERT_Q, normImport } from "./clean-question.js";
import { isCorrect, displayAnswer, publicQ } from "./answers.js";
import { awardBadges } from "./badges.js";
import { restToday, awardBonus } from "./streak.js";

const MAX_PDF_B64 = 1_800_000; // D1 rows are capped at 2 MB

const summary = (w) => ({ id: w.id, title: w.title, set_date: w.set_date, week: w.week, questions: w.questions, has_pdf: !!w.has_pdf, done_session: w.done_session || null });

async function listWorksheets(db, limit) {
  return all(db, `SELECT w.*, (SELECT COUNT(*) FROM questions q WHERE q.worksheet_id=w.id AND q.active=1) questions,
      EXISTS (SELECT 1 FROM worksheet_files f WHERE f.worksheet_id=w.id) has_pdf,
      (SELECT s.id FROM sessions s WHERE s.worksheet_id=w.id AND s.ended_at IS NOT NULL ORDER BY s.id DESC LIMIT 1) done_session
    FROM worksheets w WHERE w.active=1 ORDER BY w.set_date DESC, w.id DESC LIMIT ?`, limit);
}
const sheetQuestions = (db, id) => all(db, "SELECT * FROM questions WHERE worksheet_id=? AND active=1 ORDER BY id", id);

export async function worksheetParentRoutes({ db, method, body, seg }) {
  if (seg[1] !== "worksheets") return null;
  if (!seg[2] && method === "POST") {
    const title = String(body.title || "").trim().slice(0, 120);
    const setDate = String(body.set_date || istDay(nowIso()));
    if (!title) return fail(400, "Give the worksheet a title");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(setDate)) return fail(400, "set_date must look like 2026-11-24");
    if (!Array.isArray(body.questions) || !body.questions.length) return fail(400, "Send { questions: [...] }");
    if (body.pdf_base64 && String(body.pdf_base64).length > MAX_PDF_B64) return fail(413, "PDF is too big (limit about 1.3 MB). Compress it or drop images.");
    let rows;
    try { rows = body.questions.map((q) => cleanQ({ ...normImport(q), kind: "worksheet", week: body.week })); } catch (e) { return fail(400, e.message); }
    const week = Number(body.week) || 0;
    const w = await run(db, "INSERT INTO worksheets(title, set_date, week, created_at) VALUES (?,?,?,?)", title, setDate, week, nowIso());
    const id = w.meta?.last_row_id;
    await db.batch(rows.map((v) => db.prepare(INSERT_Q).bind(...v.slice(0, 8), id)));
    if (body.pdf_base64) await run(db, "INSERT INTO worksheet_files(worksheet_id, pdf_base64) VALUES (?, ?)", id, String(body.pdf_base64));
    return json({ id, questions: rows.length, has_pdf: !!body.pdf_base64 });
  }
  if (seg[2] && seg[3] === "pdf" && method === "POST") {
    const b64 = String(body.pdf_base64 || "");
    if (!b64 || b64.length > MAX_PDF_B64) return fail(400, "Send pdf_base64 (under about 1.3 MB)");
    if (!(await one(db, "SELECT id FROM worksheets WHERE id=?", Number(seg[2])))) return fail(404, "Not found");
    await run(db, "INSERT INTO worksheet_files(worksheet_id, pdf_base64) VALUES (?, ?) ON CONFLICT(worksheet_id) DO UPDATE SET pdf_base64=excluded.pdf_base64", Number(seg[2]), b64);
    return json({ ok: true });
  }
  if (seg[2] && !seg[3] && method === "DELETE") {
    await run(db, "UPDATE worksheets SET active=0 WHERE id=?", Number(seg[2]));
    await run(db, "UPDATE questions SET active=0 WHERE worksheet_id=?", Number(seg[2]));
    return json({ ok: true });
  }
  return null;
}

export async function worksheetKidRoutes({ db, method, body, seg }) {
  if (seg[0] !== "worksheets") return null;
  if (!seg[1] && method === "GET") return json((await listWorksheets(db, 30)).map(summary));

  const id = Number(seg[1]);
  const w = await one(db, "SELECT * FROM worksheets WHERE id=? AND active=1", id);
  if (!w) return fail(404, "No such worksheet");

  if (seg[2] === "pdf" && method === "GET") {
    const f = await one(db, "SELECT pdf_base64 FROM worksheet_files WHERE worksheet_id=?", id);
    if (!f) return fail(404, "This worksheet has no PDF");
    const bin = atob(f.pdf_base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const name = `${w.set_date}-${w.title}`.replace(/[^A-Za-z0-9._-]+/g, "-");
    return new Response(bytes, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}.pdf"`, "cache-control": "private, max-age=300" } });
  }
  if (!seg[2] && method === "GET") {
    const qs = await sheetQuestions(db, id);
    const done = await one(db, "SELECT id FROM sessions WHERE worksheet_id=? AND ended_at IS NOT NULL ORDER BY id DESC LIMIT 1", id);
    return json({ worksheet: { id: w.id, title: w.title, set_date: w.set_date, week: w.week }, questions: qs.map(publicQ), done_session: done?.id || null });
  }

  // OMR submission: answers = { "<question_id>": "<option index or typed answer>" | null }, minutes = time spent on paper
  if (seg[2] === "submit" && method === "POST") {
    const rest = await restToday(db);
    if (rest) return fail(403, `No innings today (${rest}). Submit it on the next working day.`);
    const qs = await sheetQuestions(db, id);
    if (!qs.length) return fail(404, "This worksheet has no questions");
    const given = body.answers && typeof body.answers === "object" ? body.answers : {};
    const minutes = Math.max(0, Math.min(240, Number(body.minutes) || 0));
    const ended = nowIso();
    const started = new Date(new Date(ended).getTime() - minutes * 60000).toISOString();
    const marked = qs.map((q) => {
      const g = String(given[q.id] ?? "").trim().slice(0, 200);
      const correct = isCorrect(q, g);
      return { q, g, skipped: g === "" ? 1 : 0, correct: correct ? 1 : 0, runs: correct ? RUNS_FOR[q.difficulty] || 4 : 0 };
    });
    const score = marked.filter((m) => m.correct).length;
    const runs = marked.reduce((a, m) => a + m.runs, 0);
    const s = await run(db, "INSERT INTO sessions(kind, week, question_ids, started_at, ended_at, score, total, runs, wickets, duration_s, source, worksheet_id) VALUES ('worksheet', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paper', ?)",
      w.week, JSON.stringify(qs.map((q) => q.id)), started, ended, score, qs.length, runs, qs.length - score, Math.round(minutes * 60), id);
    const sid = s.meta?.last_row_id;
    const per = minutes ? Math.round((minutes * 60000) / qs.length) : 0;
    await db.batch(marked.map((m) => db.prepare("INSERT INTO attempts(session_id, question_id, given, correct, time_ms, runs, skipped, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(sid, m.q.id, m.skipped ? null : m.g, m.correct, per, m.runs, m.skipped, ended)));
    await run(db, "INSERT INTO events(type, detail, session_id, created_at) VALUES ('session_end', ?, ?, ?)", `${score}/${qs.length} paper`, sid, ended);
    const atts = await all(db, "SELECT * FROM attempts WHERE session_id=? ORDER BY id", sid);
    const bonus = await awardBonus(db, ended);
    const newBadges = await awardBadges(db, await one(db, "SELECT * FROM sessions WHERE id=?", sid), atts);
    return json({ session_id: sid, bonus, score, total: qs.length, runs, skipped: marked.filter((m) => m.skipped).length, newBadges,
      review: marked.map((m) => ({ question_id: m.q.id, given: m.skipped ? null : m.g, correct: !!m.correct, skipped: !!m.skipped, answer: displayAnswer(m.q), method: m.q.method })) });
  }
  return null;
}
