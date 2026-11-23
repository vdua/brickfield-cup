// Chooses the questions for a new session.
import { all } from "./util.js";

export async function pick(db, kind, week) {
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
