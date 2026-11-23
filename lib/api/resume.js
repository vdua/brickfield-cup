// Retire leaves an innings unfinished. Starting that mission again resumes the same innings:
// the balls already answered are final (marked, never re-asked) and only the unanswered ones come back.
import { all, one, run } from "./util.js";
import { publicQ } from "./answers.js";

export async function resumeUnfinished(db, week, slot) {
  const s = await one(db, "SELECT * FROM sessions WHERE week=? AND slot=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1", week, slot);
  if (!s) return null;
  const answered = await all(db, "SELECT question_id, correct, runs, time_ms FROM attempts WHERE session_id=? ORDER BY id", s.id);
  const seen = new Set(answered.map((a) => a.question_id));
  const ids = JSON.parse(s.question_ids);
  const rows = await all(db, `SELECT * FROM questions WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  const byId = new Map(rows.map((q) => [q.id, q]));
  // the break between retiring and resuming is not playing time: restart the clock minus the time already spent
  const spent = answered.reduce((a, x) => a + x.time_ms, 0);
  const started = new Date(Date.now() - spent).toISOString();
  await run(db, "UPDATE sessions SET started_at=? WHERE id=?", started, s.id);
  return {
    session: { id: s.id, kind: s.kind, week: s.week, slot: s.slot, started_at: started },
    questions: ids.filter((id) => !seen.has(id) && byId.has(id)).map((id) => publicQ(byId.get(id))),
    prior: answered.map((a) => ({ correct: !!a.correct, runs: a.runs })),
    parSec: s.kind === "diagnostic" || s.kind === "mock" ? 216 : 180,
  };
}
