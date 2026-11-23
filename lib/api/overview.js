// Parent dashboard overview.
import { ROADMAP, BADGES, STADIUM } from "../content.js";
import { all, istDay } from "./util.js";
import { getSettings, currentWeek } from "./settings.js";
import { streakFrom, playedDays, totals, stageFor } from "./stats.js";

export async function parentOverview(db) {
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
