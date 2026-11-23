// Brickfield Cup API — runs as a Cloudflare Pages Function (a Worker) with a D1 binding named DB.
import { ROADMAP, MISSION, BADGES, STADIUM, RUNS_FOR, MISTAKES, EVENT_TYPES } from "./content.js";

const IST_MS = 330 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const istDay = (iso) => new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);
const istHour = (iso) => new Date(new Date(iso).getTime() + IST_MS).getUTCHours();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
const fail = (status, error) => json({ error }, status);

// ---------- auth (HMAC-signed cookie) ----------
const enc = (s) => new TextEncoder().encode(s);
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(data, secret) {
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc(data)));
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function readRole(request, env) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)bc_sess=([^;]+)/);
  if (!m) return null;
  const [role, exp, sig] = decodeURIComponent(m[1]).split(".");
  if (!role || !exp || !sig || Date.now() > Number(exp)) return null;
  return safeEqual(sig, await hmac(`${role}.${exp}`, env.SESSION_SECRET)) ? role : null;
}
async function sessionCookie(role, env, secure) {
  const days = role === "kid" ? 60 : 14;
  const exp = Date.now() + days * 864e5;
  const value = `${role}.${exp}.${await hmac(`${role}.${exp}`, env.SESSION_SECRET)}`;
  return `bc_sess=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure ? "; Secure" : ""}`;
}

// ---------- helpers ----------
const all = async (db, sql, ...b) => (await db.prepare(sql).bind(...b).all()).results || [];
const one = (db, sql, ...b) => db.prepare(sql).bind(...b).first();
const run = (db, sql, ...b) => db.prepare(sql).bind(...b).run();

async function getSettings(db) {
  return Object.fromEntries((await all(db, "SELECT key, value FROM settings")).map((r) => [r.key, r.value]));
}
function currentWeek(s) {
  const o = Number(s.week_override || 0);
  if (o > 0) return Math.min(o, ROADMAP.length);
  const start = new Date(`${s.start_date || "2026-11-23"}T00:00:00+05:30`).getTime();
  const w = Math.floor((Date.now() - start) / (7 * 864e5)) + 1;
  return Math.max(1, Math.min(ROADMAP.length, w));
}

const UNIT_RE = /₹|rs\.?|km\/h|kmph|degrees?|°|minutes?|mins?|hours?|hrs?|litres?|liters?|metres?|meters?|cm|km|kg|runs?|\bl\b|\bm\b|\bh\b|\bg\b|,/gi;
function toNumber(raw) {
  const s = String(raw ?? "").toLowerCase().replace(UNIT_RE, "").replace(/\s+/g, " ").trim();
  if (!s) return NaN;
  let m = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/); // mixed number 4 1/6
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(-?\d*\.?\d+)\s*\/\s*(\d*\.?\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
export function isCorrect(q, given) {
  if (given === null || given === undefined || String(given).trim() === "") return false;
  if (q.options) return String(given).trim() === String(q.answer).trim();
  const a = toNumber(q.answer), g = toNumber(given);
  if (!Number.isNaN(a) && !Number.isNaN(g)) return Math.abs(a - g) < 1e-6;
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(given) === norm(q.answer);
}
const displayAnswer = (q) => (q.options ? JSON.parse(q.options)[Number(q.answer)] : q.answer);
const publicQ = (q) => ({ id: q.id, topic: q.topic, difficulty: q.difficulty, prompt: q.prompt, options: q.options ? JSON.parse(q.options) : null });

function streakFrom(days) {
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
async function playedDays(db) {
  const rows = await all(db, "SELECT ended_at FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 400");
  return [...new Set(rows.map((r) => istDay(r.ended_at)))];
}
async function totals(db) {
  const t = await one(db, "SELECT COALESCE(SUM(runs),0) runs, COUNT(*) sessions, COALESCE(SUM(score),0) correct, COALESCE(SUM(total),0) balls FROM sessions WHERE ended_at IS NOT NULL");
  const spent = await one(db, "SELECT COALESCE(SUM(cost),0) s FROM rewards WHERE status IN ('requested','approved')");
  return { ...t, spent: spent.s, wallet: t.runs - spent.s };
}
const stageFor = (runs) => STADIUM.reduce((acc, s, i) => (runs >= s.runs ? i : acc), 0);

// ---------- question picking ----------
async function pick(db, kind, week) {
  const q = (sql, ...b) => all(db, sql, ...b);
  const fill = async (list, n, sql, ...b) => {
    if (list.length >= n) return list;
    const ids = list.map((x) => x.id);
    const more = await q(sql.replace("/*EXCL*/", ids.length ? `AND id NOT IN (${ids.join(",")})` : ""), ...b, n - list.length);
    return list.concat(more);
  };
  switch (kind) {
    case "diagnostic":
      return q("SELECT * FROM questions WHERE active=1 AND kind='diagnostic' ORDER BY id");
    case "before":
    case "after":
      return q("SELECT * FROM questions WHERE active=1 AND kind=? AND week=? ORDER BY id", kind, week);
    case "puzzle": {
      // prefer puzzles never answered correctly
      let list = await q("SELECT * FROM questions WHERE active=1 AND kind='puzzle' AND id NOT IN (SELECT question_id FROM attempts WHERE correct=1) ORDER BY RANDOM() LIMIT 3");
      return fill(list, 3, "SELECT * FROM questions WHERE active=1 AND kind='puzzle' /*EXCL*/ ORDER BY RANDOM() LIMIT ?");
    }
    case "revision": {
      let list = await q(`SELECT q.* FROM questions q WHERE q.active=1 AND q.id IN (
          SELECT a.question_id FROM attempts a WHERE a.correct=0 AND NOT EXISTS (
            SELECT 1 FROM attempts b WHERE b.question_id=a.question_id AND b.correct=1 AND b.id > a.id))
        ORDER BY RANDOM() LIMIT 5`);
      return fill(list, 5, "SELECT * FROM questions WHERE active=1 AND kind='practice' AND week BETWEEN 1 AND ? /*EXCL*/ ORDER BY RANDOM() LIMIT ?", Math.max(1, week - 1));
    }
    case "mock": {
      const list = await q("SELECT * FROM questions WHERE active=1 AND kind='mock' AND week=? ORDER BY id", week);
      if (list.length) return list;
      return q("SELECT * FROM questions WHERE active=1 AND kind IN ('practice','before','after','puzzle','diagnostic') AND week <= ? ORDER BY RANDOM() LIMIT 20", week);
    }
    default: { // practice
      let list = await q("SELECT * FROM questions WHERE active=1 AND kind='practice' AND week=? AND id NOT IN (SELECT question_id FROM attempts WHERE correct=1) ORDER BY RANDOM() LIMIT 6", week);
      list = await fill(list, 6, "SELECT * FROM questions WHERE active=1 AND kind='practice' AND week=? /*EXCL*/ ORDER BY RANDOM() LIMIT ?", week);
      return fill(list, 6, "SELECT * FROM questions WHERE active=1 AND kind='practice' AND week <= ? /*EXCL*/ ORDER BY RANDOM() LIMIT ?", Math.max(week, 1));
    }
  }
}

// ---------- badges ----------
async function awardBadges(db, session, atts) {
  const have = new Set((await all(db, "SELECT code FROM badges")).map((r) => r.code));
  const earn = new Set();
  const finished = await one(db, "SELECT COUNT(*) n FROM sessions WHERE ended_at IS NOT NULL");
  if (finished.n >= 1) earn.add("first_innings");
  if (session.runs >= 50) earn.add("fifty");
  let streak = 0, best = 0;
  for (const a of atts) { streak = a.correct ? streak + 1 : 0; best = Math.max(best, streak); }
  if (best >= 6) earn.add("perfect_over");
  if (atts.length >= 5 && atts.every((a) => a.correct)) earn.add("clean_sheet");
  const s = streakFrom(await playedDays(db));
  if (s >= 3) earn.add("streak3");
  if (s >= 7) earn.add("streak7");
  if (s >= 14) earn.add("streak14");
  if (session.kind === "after") {
    if (session.total > 0 && session.score === session.total) earn.add("topic_master");
    const before = await one(db, "SELECT MAX(score) s FROM sessions WHERE kind='before' AND week=? AND ended_at IS NOT NULL", session.week);
    if (before && before.s !== null && session.score - before.s >= 2) earn.add("big_gain");
  }
  if (session.kind === "revision" && session.score >= 4) earn.add("comeback");
  const topics = await one(db, "SELECT COUNT(DISTINCT q.topic) n FROM attempts a JOIN questions q ON q.id=a.question_id WHERE a.correct=1");
  if (topics.n >= 6) earn.add("all_rounder");
  if (istHour(session.ended_at) < 8) earn.add("early_bird");
  const tagged = await one(db, "SELECT COUNT(*) n FROM attempts WHERE mistake IS NOT NULL");
  if (tagged.n >= 10) earn.add("honest_review");
  const fresh = [...earn].filter((c) => !have.has(c));
  for (const c of fresh) await run(db, "INSERT OR IGNORE INTO badges(code, earned_at) VALUES (?, ?)", c, session.ended_at);
  return BADGES.filter((b) => fresh.includes(b.code));
}

// ---------- kid state ----------
async function kidState(db) {
  const s = await getSettings(db);
  const week = currentWeek(s);
  const t = await totals(db);
  const days = await playedDays(db);
  const earned = Object.fromEntries((await all(db, "SELECT code, earned_at FROM badges")).map((r) => [r.code, r.earned_at]));
  const weekRows = await all(db, "SELECT kind, COUNT(*) n, MAX(score) best, MAX(total) total FROM sessions WHERE week=? AND ended_at IS NOT NULL GROUP BY kind", week);
  const byKind = Object.fromEntries(weekRows.map((r) => [r.kind, r]));
  const hasBefore = (await one(db, "SELECT COUNT(*) n FROM questions WHERE active=1 AND kind='before' AND week=?", week)).n > 0;
  const hasAfter = (await one(db, "SELECT COUNT(*) n FROM questions WHERE active=1 AND kind='after' AND week=?", week)).n > 0;
  const mission = MISSION.map((m) => {
    let kind = m.kind, label = m.label, hint = m.hint;
    if (week === 1 && m.kind === "before") { kind = "diagnostic"; label = "Big toss"; hint = "Diagnostic · 20 balls · 45 min"; }
    const done = byKind[kind]?.n || 0;
    const available = kind === "before" ? hasBefore : kind === "after" ? hasAfter : true;
    return { kind, label, hint, need: m.need, done: Math.min(done, m.need), best: byKind[kind]?.best ?? null, total: byKind[kind]?.total ?? null, available };
  });
  const today = istDay(nowIso());
  const recent = await all(db, "SELECT id, kind, week, score, total, runs, wickets, duration_s, ended_at FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 6");
  const todayRows = await all(db, "SELECT duration_s, away_s, ended_at FROM sessions WHERE ended_at IS NOT NULL AND ended_at >= ?", new Date(Date.now() - 2 * 864e5).toISOString());
  const todayMin = Math.round(todayRows.filter((r) => istDay(r.ended_at) === today).reduce((a, r) => a + Math.max(0, r.duration_s - r.away_s), 0) / 60);
  const message = await one(db, "SELECT id, body, created_at, seen_at, reaction FROM messages ORDER BY id DESC LIMIT 1");
  const rewards = await all(db, "SELECT id, title, cost, status FROM rewards WHERE status != 'archived' ORDER BY cost");
  const stage = stageFor(t.runs);
  return {
    player: s.player_name || "Captain", team: s.team_name || "Brickers",
    week, roadmap: ROADMAP, thisWeek: ROADMAP[week - 1], mission,
    totals: t, streak: streakFrom(days), playedToday: days.includes(today),
    todayMin, goalMin: Number(s.daily_goal_min || 30),
    badges: BADGES.map((b) => ({ ...b, earned_at: earned[b.code] || null })),
    stadium: { stage, stages: STADIUM, next: STADIUM[stage + 1] || null },
    recent, message, rewards,
  };
}

// ---------- parent overview ----------
async function parentOverview(db) {
  const s = await getSettings(db);
  const week = currentWeek(s);
  const sessions = await all(db, "SELECT * FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at");
  const careless = await all(db, "SELECT s.week, COUNT(*) n FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE a.mistake='careless' GROUP BY s.week");
  const carelessBy = Object.fromEntries(careless.map((r) => [r.week, r.n]));
  const tracker = ROADMAP.map((r) => {
    const ws = sessions.filter((x) => x.week === r.week);
    const last = (k) => ws.filter((x) => x.kind === k).slice(-1)[0] || null;
    const first = (k) => ws.find((x) => x.kind === k) || null;
    const prac = ws.filter((x) => x.kind === "practice");
    const pc = prac.reduce((a, x) => a + x.score, 0), pt = prac.reduce((a, x) => a + x.total, 0);
    const before = r.week === 1 ? first("diagnostic") : first("before");
    const after = last("after");
    const mock = last("mock");
    return {
      week: r.week, topic: r.topic, phase: r.phase, start: r.start,
      before: before ? { score: before.score, total: before.total } : null,
      after: after ? { score: after.score, total: after.total } : null,
      mock: mock ? { score: mock.score, total: mock.total } : null,
      practice: pt ? { pct: Math.round((pc / pt) * 100), sessions: prac.length } : null,
      careless: carelessBy[r.week] || 0,
      minutes: Math.round(ws.reduce((a, x) => a + Math.max(0, x.duration_s - x.away_s), 0) / 60),
    };
  });
  const topics = await all(db, `SELECT q.topic, COUNT(*) n, SUM(a.correct) c, AVG(a.time_ms) t,
      SUM(CASE WHEN a.mistake='careless' THEN 1 ELSE 0 END) careless
    FROM attempts a JOIN questions q ON q.id=a.question_id GROUP BY q.topic ORDER BY q.topic`);
  const recentTopics = await all(db, `SELECT q.topic, a.correct FROM attempts a JOIN questions q ON q.id=a.question_id ORDER BY a.id DESC LIMIT 400`);
  const recentBy = {};
  for (const r of recentTopics) { (recentBy[r.topic] ||= []).length < 15 && recentBy[r.topic].push(r.correct); }
  const mistakes = await all(db, "SELECT COALESCE(mistake,'untagged') m, COUNT(*) n FROM attempts WHERE correct=0 GROUP BY 1");
  const daily = [];
  for (let i = 27; i >= 0; i--) {
    const d = istDay(new Date(Date.now() - i * 864e5).toISOString());
    const ds = sessions.filter((x) => istDay(x.ended_at) === d);
    daily.push({
      day: d,
      minutes: Math.round(ds.reduce((a, x) => a + Math.max(0, x.duration_s - x.away_s), 0) / 60),
      awayMin: Math.round(ds.reduce((a, x) => a + x.away_s, 0) / 60),
      sessions: ds.length,
      balls: ds.reduce((a, x) => a + x.total, 0),
      correct: ds.reduce((a, x) => a + x.score, 0),
    });
  }
  const t = await totals(db);
  return {
    week, settings: s, tracker, daily, totals: t, streak: streakFrom(await playedDays(db)),
    topics: topics.map((r) => ({ topic: r.topic, attempts: r.n, accuracy: Math.round((r.c / r.n) * 100), avgSec: Math.round((r.t || 0) / 1000), careless: r.careless, recent: recentBy[r.topic] || [] })),
    mistakes, badges: (await all(db, "SELECT code, earned_at FROM badges ORDER BY earned_at DESC")).map((b) => ({ ...BADGES.find((x) => x.code === b.code), earned_at: b.earned_at })),
    pendingRewards: await all(db, "SELECT * FROM rewards WHERE status='requested'"),
    stage: STADIUM[stageFor(t.runs)].name,
  };
}

// ---------- router ----------
export async function handle(request, env) {
  if (!env.DB) return fail(500, "D1 binding 'DB' is missing — see README.");
  if (!env.SESSION_SECRET) return fail(500, "SESSION_SECRET is not set — see README.");
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const method = request.method;
  const body = method === "GET" || method === "DELETE" ? {} : await request.json().catch(() => ({}));
  const seg = path.split("/").filter(Boolean);
  const secure = url.protocol === "https:";

  // --- public ---
  if (path === "/login" && method === "POST") {
    const since = new Date(Date.now() - 15 * 60000).toISOString();
    const fails = await one(db, "SELECT COUNT(*) n FROM events WHERE type='login_fail' AND created_at > ?", since);
    if (fails.n >= 8) return fail(429, "Too many wrong PINs. Wait 15 minutes.");
    const role = body.role === "parent" ? "parent" : "kid";
    const expected = role === "parent" ? env.PARENT_PIN : env.KID_PIN;
    if (!expected || !safeEqual(String(body.pin || ""), String(expected))) {
      await run(db, "INSERT INTO events(type, detail, created_at) VALUES ('login_fail', ?, ?)", role, nowIso());
      return fail(401, "Wrong PIN");
    }
    await run(db, "INSERT INTO events(type, detail, created_at) VALUES ('login', ?, ?)", role, nowIso());
    return json({ ok: true, role }, 200, { "set-cookie": await sessionCookie(role, env, secure) });
  }
  if (path === "/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": "bc_sess=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" });
  }

  const role = await readRole(request, env);
  if (!role) return fail(401, "Please log in");
  if (path === "/me") return json({ role });

  // --- kid (parent may use these too, e.g. to try a test) ---
  if (path === "/state" && method === "GET") return json(await kidState(db));

  if (path === "/session/start" && method === "POST") {
    const kinds = ["practice", "before", "after", "puzzle", "revision", "diagnostic", "mock"];
    const kind = kinds.includes(body.kind) ? body.kind : "practice";
    const s = await getSettings(db);
    const week = Number(body.week) || currentWeek(s);
    const qs = await pick(db, kind, week);
    if (!qs.length) return fail(404, "No questions here yet. Ask Dad to add some in the dashboard!");
    const started = nowIso();
    const r = await run(db, "INSERT INTO sessions(kind, week, question_ids, started_at, total) VALUES (?, ?, ?, ?, ?)", kind, week, JSON.stringify(qs.map((q) => q.id)), started, qs.length);
    const id = r.meta?.last_row_id;
    await run(db, "INSERT INTO events(type, detail, session_id, created_at) VALUES ('session_start', ?, ?, ?)", kind, id, started);
    return json({ session: { id, kind, week, started_at: started }, questions: qs.map(publicQ), parSec: kind === "diagnostic" || kind === "mock" ? 216 : 180 });
  }

  if (seg[0] === "session" && seg[1] && seg[2] === "answer" && method === "POST") {
    const sid = Number(seg[1]);
    const sess = await one(db, "SELECT * FROM sessions WHERE id=?", sid);
    if (!sess) return fail(404, "No such session");
    if (sess.ended_at) return fail(409, "This innings is already over");
    const qid = Number(body.question_id);
    if (!JSON.parse(sess.question_ids).includes(qid)) return fail(400, "That question is not in this innings");
    if (await one(db, "SELECT id FROM attempts WHERE session_id=? AND question_id=?", sid, qid)) return fail(409, "Already answered");
    const q = await one(db, "SELECT * FROM questions WHERE id=?", qid);
    const correct = isCorrect(q, body.given);
    const runs = correct ? RUNS_FOR[q.difficulty] || 4 : 0;
    const r = await run(db, "INSERT INTO attempts(session_id, question_id, given, correct, time_ms, runs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      sid, qid, String(body.given ?? "").slice(0, 200), correct ? 1 : 0, Math.max(0, Math.min(3600000, Number(body.time_ms) || 0)), runs, nowIso());
    return json({ attempt_id: r.meta?.last_row_id, correct, runs, answer: displayAnswer(q), method: q.method });
  }

  if (seg[0] === "attempt" && seg[1] && seg[2] === "mistake" && method === "POST") {
    if (!MISTAKES.includes(body.type)) return fail(400, "Unknown mistake type");
    await run(db, "UPDATE attempts SET mistake=? WHERE id=? AND correct=0", body.type, Number(seg[1]));
    return json({ ok: true });
  }

  if (seg[0] === "session" && seg[1] && seg[2] === "finish" && method === "POST") {
    const sid = Number(seg[1]);
    const sess = await one(db, "SELECT * FROM sessions WHERE id=?", sid);
    if (!sess) return fail(404, "No such session");
    const before = await totals(db);
    if (!sess.ended_at) {
      const atts = await all(db, "SELECT * FROM attempts WHERE session_id=? ORDER BY id", sid);
      const ended = nowIso();
      const score = atts.filter((a) => a.correct).length;
      const runs = atts.reduce((a, x) => a + x.runs, 0);
      const duration = Math.round((new Date(ended) - new Date(sess.started_at)) / 1000);
      const away = Math.max(0, Math.min(duration, Number(body.away_s) || 0));
      await run(db, "UPDATE sessions SET ended_at=?, score=?, runs=?, wickets=?, duration_s=?, away_s=?, away_count=? WHERE id=?",
        ended, score, runs, atts.length - score, duration, away, Number(body.away_count) || 0, sid);
      await run(db, "INSERT INTO events(type, detail, session_id, created_at) VALUES ('session_end', ?, ?, ?)", `${score}/${sess.total}`, sid, ended);
      const updated = await one(db, "SELECT * FROM sessions WHERE id=?", sid);
      const fresh = await awardBadges(db, updated, atts);
      const after = await totals(db);
      return json({ session: updated, newBadges: fresh, totals: after, stageBefore: stageFor(before.runs), stageAfter: stageFor(after.runs), stages: STADIUM });
    }
    return json({ session: sess, newBadges: [], totals: before, stageBefore: stageFor(before.runs), stageAfter: stageFor(before.runs), stages: STADIUM });
  }

  if (path === "/event" && method === "POST") {
    if (!EVENT_TYPES.includes(body.type)) return fail(400, "Unknown event");
    await run(db, "INSERT INTO events(type, detail, session_id, created_at) VALUES (?, ?, ?, ?)", body.type, String(body.detail ?? "").slice(0, 200), body.session_id || null, nowIso());
    return json({ ok: true });
  }

  if (seg[0] === "messages" && seg[1] && method === "POST") {
    const id = Number(seg[1]);
    if (seg[2] === "seen") await run(db, "UPDATE messages SET seen_at=COALESCE(seen_at, ?) WHERE id=?", nowIso(), id);
    if (seg[2] === "react") await run(db, "UPDATE messages SET reaction=?, seen_at=COALESCE(seen_at, ?) WHERE id=?", String(body.reaction || "").slice(0, 16), nowIso(), id);
    return json({ ok: true });
  }

  if (seg[0] === "rewards" && seg[1] && seg[2] === "request" && method === "POST") {
    const rw = await one(db, "SELECT * FROM rewards WHERE id=?", Number(seg[1]));
    if (!rw || rw.status !== "available") return fail(400, "That reward isn't available");
    const t = await totals(db);
    if (t.wallet < rw.cost) return fail(400, `You need ${rw.cost - t.wallet} more runs`);
    await run(db, "UPDATE rewards SET status='requested', requested_at=? WHERE id=?", nowIso(), rw.id);
    return json({ ok: true });
  }

  // --- parent only ---
  if (seg[0] !== "parent") return fail(404, "Not found");
  if (role !== "parent") return fail(403, "Parents only");
  const p = "/" + seg.slice(1).join("/");

  if (p === "/overview") return json(await parentOverview(db));

  if (p === "/sessions" && method === "GET") {
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50);
    return json(await all(db, "SELECT id, kind, week, started_at, ended_at, score, total, runs, wickets, duration_s, away_s, away_count FROM sessions ORDER BY id DESC LIMIT ?", limit));
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

  // questions
  const cleanQ = (b) => {
    const kind = ["practice", "before", "after", "puzzle", "diagnostic", "mock"].includes(b.kind) ? b.kind : "practice";
    const opts = Array.isArray(b.options) && b.options.filter((o) => String(o).trim()).length >= 2 ? b.options.map(String) : null;
    if (!String(b.prompt || "").trim() || String(b.answer ?? "").trim() === "") throw new Error("Prompt and answer are required");
    if (opts && !(Number(b.answer) >= 0 && Number(b.answer) < opts.length)) throw new Error("For multiple choice, answer is the option number starting at 0");
    return [Number(b.week) || 0, kind, String(b.topic || "General").trim(), [1, 2, 3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2,
      String(b.prompt).trim(), String(b.answer).trim(), opts ? JSON.stringify(opts) : null, String(b.method || "").trim() || null];
  };
  if (p === "/questions" && method === "GET") {
    const rows = await all(db, `SELECT q.*, (SELECT COUNT(*) FROM attempts a WHERE a.question_id=q.id) tries,
        (SELECT SUM(correct) FROM attempts a WHERE a.question_id=q.id) rights FROM questions q WHERE q.active=1 ORDER BY q.week, q.kind, q.id`);
    return json(rows.map((r) => ({ ...r, options: r.options ? JSON.parse(r.options) : null })));
  }
  if (p === "/questions" && method === "POST") {
    try {
      const v = cleanQ(body);
      const r = await run(db, "INSERT INTO questions(week, kind, topic, difficulty, prompt, answer, options, method) VALUES (?,?,?,?,?,?,?,?)", ...v);
      return json({ id: r.meta?.last_row_id });
    } catch (e) { return fail(400, e.message); }
  }
  if (p === "/questions/import" && method === "POST") {
    if (!Array.isArray(body.questions)) return fail(400, "Send { questions: [...] }");
    let n = 0;
    try {
      const stmts = body.questions.map((q) => db.prepare("INSERT INTO questions(week, kind, topic, difficulty, prompt, answer, options, method) VALUES (?,?,?,?,?,?,?,?)")
        .bind(...cleanQ({ week: q.week ?? q.w, kind: q.kind ?? q.k, topic: q.topic ?? q.t, difficulty: q.difficulty ?? q.d, prompt: q.prompt ?? q.q, answer: q.answer ?? q.a, options: q.options ?? q.o, method: q.method ?? q.m })));
      if (stmts.length) await db.batch(stmts);
      n = stmts.length;
    } catch (e) { return fail(400, e.message); }
    return json({ imported: n });
  }
  if (seg[1] === "questions" && seg[2] && method === "PUT") {
    try {
      const v = cleanQ(body);
      await run(db, "UPDATE questions SET week=?, kind=?, topic=?, difficulty=?, prompt=?, answer=?, options=?, method=? WHERE id=?", ...v, Number(seg[2]));
      return json({ ok: true });
    } catch (e) { return fail(400, e.message); }
  }
  if (seg[1] === "questions" && seg[2] && method === "DELETE") {
    await run(db, "UPDATE questions SET active=0 WHERE id=?", Number(seg[2]));
    return json({ ok: true });
  }

  // settings
  if (p === "/settings" && method === "POST") {
    const allowed = ["player_name", "team_name", "start_date", "week_override", "daily_goal_min"];
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

  return fail(404, "Not found");
}
