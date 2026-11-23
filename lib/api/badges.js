import { BADGES } from "../content.js";
import { all, one, run, istHour } from "./util.js";
import { streakFrom, playedDays } from "./stats.js";

export async function awardBadges(db, session, atts) {
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
