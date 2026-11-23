// Parent-only routes (everything under /api/parent). Returns a Response, or null when no route matches.
import { json, fail, all, one, run, nowIso } from "./util.js";
import { getSettings } from "./settings.js";
import { displayAnswer } from "./answers.js";
import { cleanQ, INSERT_Q, normImport } from "./clean-question.js";
import { worksheetParentRoutes } from "./worksheets.js";
import { guideParentRoutes } from "./guides.js";
import { slotParentRoutes } from "./slots.js";
import { parentOverview } from "./overview.js";
import { dailyStats } from "./daily.js";
import { calendar } from "./calendar.js";

export async function parentRoutes({ db, url, method, body, seg }) {
  const p = "/" + seg.slice(1).join("/");

  if (p === "/overview") return json(await parentOverview(db));

  if (p === "/calendar" && method === "GET") return json(await calendar(db, url.searchParams.get("from"), url.searchParams.get("days")));

  if (p === "/daily" && method === "GET") return json(await dailyStats(db, Math.min(120, Number(url.searchParams.get("days")) || 30)));

  if (p === "/sessions" && method === "GET") {
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50);
    return json(await all(db, "SELECT id, kind, week, source, worksheet_id, started_at, ended_at, score, total, runs, wickets, duration_s, away_s, away_count FROM sessions ORDER BY id DESC LIMIT ?", limit));
  }
  if (seg[1] === "sessions" && seg[2] && method === "GET") {
    const sess = await one(db, "SELECT * FROM sessions WHERE id=?", Number(seg[2]));
    if (!sess) return fail(404, "Not found");
    const atts = await all(db, `SELECT a.*, q.prompt, q.topic, q.difficulty, q.answer, q.options, q.method FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.session_id=? ORDER BY a.id`, sess.id);
    const events = await all(db, "SELECT type, detail, created_at FROM events WHERE session_id=? ORDER BY id", sess.id);
    return json({ session: sess, attempts: atts.map((a) => ({ ...a, answer: displayAnswer(a) })), events });
  }
  if (p === "/errors" && method === "GET") {
    const rows = await all(db, `SELECT a.id, a.given, a.mistake, a.time_ms, a.created_at, q.id qid, q.prompt, q.topic, q.answer, q.options, q.method, s.kind, s.week,
        EXISTS (SELECT 1 FROM attempts b WHERE b.question_id=a.question_id AND b.correct=1 AND b.id > a.id) fixed
      FROM attempts a JOIN questions q ON q.id=a.question_id JOIN sessions s ON s.id=a.session_id
      WHERE a.correct=0 ORDER BY a.id DESC LIMIT 300`);
    return json(rows.map((r) => ({ ...r, answer: displayAnswer(r) })));
  }
  if (p === "/events" && method === "GET") {
    return json(await all(db, "SELECT * FROM events ORDER BY id DESC LIMIT ?", Math.min(500, Number(url.searchParams.get("limit")) || 150)));
  }

  const ws = await worksheetParentRoutes({ db, url, method, body, seg });
  if (ws) return ws;
  const sl = await slotParentRoutes({ db, method, body, seg });
  if (sl) return sl;
  const gd = await guideParentRoutes({ db, method, body, seg });
  if (gd) return gd;

  // questions
  if (p === "/questions" && method === "GET") {
    const rows = await all(db, `SELECT q.*, (SELECT COUNT(*) FROM attempts a WHERE a.question_id=q.id) tries,
        (SELECT SUM(correct) FROM attempts a WHERE a.question_id=q.id) rights FROM questions q WHERE q.active=1 ORDER BY q.week, q.kind, q.id`);
    return json(rows.map((r) => ({ ...r, options: r.options ? JSON.parse(r.options) : null })));
  }
  if (p === "/questions" && method === "POST") {
    try {
      const v = cleanQ(body);
      const r = await run(db, INSERT_Q, ...v);
      return json({ id: r.meta?.last_row_id });
    } catch (e) { return fail(400, e.message); }
  }
  if (p === "/questions/import" && method === "POST") {
    if (!Array.isArray(body.questions)) return fail(400, "Send { questions: [...] }");
    let n = 0;
    try {
      const stmts = body.questions.map((q) => db.prepare(INSERT_Q).bind(...cleanQ(normImport(q))));
      if (stmts.length) await db.batch(stmts);
      n = stmts.length;
    } catch (e) { return fail(400, e.message); }
    return json({ imported: n });
  }
  if (seg[1] === "questions" && seg[2] && method === "PUT") {
    try {
      const v = cleanQ(body);
      await run(db, "UPDATE questions SET week=?, kind=?, topic=?, difficulty=?, prompt=?, answer=?, options=?, method=? WHERE id=?", ...v.slice(0, 8), Number(seg[2]));
      return json({ ok: true });
    } catch (e) { return fail(400, e.message); }
  }
  if (seg[1] === "questions" && seg[2] && method === "DELETE") {
    await run(db, "UPDATE questions SET active=0 WHERE id=?", Number(seg[2]));
    return json({ ok: true });
  }

  // holidays: days with no play that never break the regularity streak
  if (p === "/holidays" && method === "GET") return json(await all(db, "SELECT day, note FROM holidays ORDER BY day DESC LIMIT 120"));
  if (p === "/holidays" && method === "POST") {
    const day = String(body.day || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(400, "Pick a date");
    await run(db, "INSERT INTO holidays(day, note, created_at) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET note=excluded.note", day, String(body.note || "").trim().slice(0, 60) || null, nowIso());
    return json({ ok: true });
  }
  if (seg[1] === "holidays" && seg[2] && method === "DELETE") {
    await run(db, "DELETE FROM holidays WHERE day=?", seg[2]);
    return json({ ok: true });
  }

  // settings
  if (p === "/settings" && method === "POST") {
    const allowed = ["player_name", "team_name", "start_date", "week_override", "daily_goal_min", "rest_days"];
    for (const k of allowed) if (body[k] !== undefined) await run(db, "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, String(body[k]).slice(0, 80));
    return json(await getSettings(db));
  }

  // messages & rewards
  if (p === "/messages" && method === "GET") return json(await all(db, "SELECT * FROM messages ORDER BY id DESC LIMIT 30"));
  if (p === "/messages" && method === "POST") {
    const text = String(body.body || "").trim().slice(0, 280);
    if (!text) return fail(400, "Write a message first");
    await run(db, "INSERT INTO messages(body, created_at) VALUES (?, ?)", text, nowIso());
    return json({ ok: true });
  }
  if (p === "/rewards" && method === "GET") return json(await all(db, "SELECT * FROM rewards WHERE status != 'archived' ORDER BY status, cost"));
  if (p === "/rewards" && method === "POST") {
    const cost = Math.round(Number(body.cost));
    if (!String(body.title || "").trim() || !(cost > 0)) return fail(400, "Give the reward a title and a run cost");
    await run(db, "INSERT INTO rewards(title, cost) VALUES (?, ?)", String(body.title).trim().slice(0, 80), cost);
    return json({ ok: true });
  }
  if (seg[1] === "rewards" && seg[2] && method === "POST") {
    const st = body.status;
    if (!["available", "approved", "archived"].includes(st)) return fail(400, "Bad status");
    const rw = await one(db, "SELECT * FROM rewards WHERE id=?", Number(seg[2]));
    if (!rw) return fail(404, "Not found");
    await run(db, "UPDATE rewards SET status=?, approved_at=CASE WHEN ?='approved' THEN ? ELSE approved_at END WHERE id=?", st, st, nowIso(), rw.id);
    // approved rewards stay as history; put a fresh copy back on the shelf so it can be earned again
    if (st === "approved" && rw.status !== "approved" && body.repeat !== false) await run(db, "INSERT INTO rewards(title, cost) VALUES (?, ?)", rw.title, rw.cost);
    return json({ ok: true });
  }
  return null;
}
