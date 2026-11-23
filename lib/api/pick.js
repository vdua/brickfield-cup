// Chooses the questions for a new session.
import { all } from './util.js';

// Active questions he got wrong and hasn't answered correctly since, in random order.
export const unfixedMistakes = (db, limit) => all(db, `SELECT q.* FROM questions q WHERE q.active=1 AND q.id IN (
    SELECT a.question_id FROM attempts a WHERE a.correct=0 AND NOT EXISTS (
      SELECT 1 FROM attempts b WHERE b.question_id=a.question_id AND b.correct=1 AND b.id > a.id))
  ORDER BY RANDOM() LIMIT ?`, limit);

export async function pick(db, kind, week, worksheetId = null) {
	const q = (sql, ...b) => all(db, sql, ...b);
	const fill = async (list, n, sql, ...b) => {
		if (list.length >= n) return list;
		const ids = list.map((x) => x.id);
		const more = await q(sql.replace('/*EXCL*/', ids.length ? `AND id NOT IN (${ids.join(',')})` : ''), ...b, n - list.length);
		return list.concat(more);
	};
	switch (kind) {
		case 'worksheet':
			return worksheetId ? q('SELECT * FROM questions WHERE active=1 AND worksheet_id=? ORDER BY id', worksheetId) : [];
		case 'diagnostic':
			return q("SELECT * FROM questions WHERE active=1 AND kind='diagnostic' ORDER BY id");
		case 'before':
		case 'after':
			return q('SELECT * FROM questions WHERE active=1 AND kind=? AND week=? ORDER BY id', kind, week);
		case 'puzzle': {
			// 6 puzzles: this week's first, then any-week ones; prefer ones never answered correctly
			const sql = (extra) => `SELECT * FROM questions WHERE active=1 AND kind='puzzle' AND week IN (0, ?) ${extra} ORDER BY (week = ?) DESC, RANDOM() LIMIT ?`;
			let list = await q(sql('AND id NOT IN (SELECT question_id FROM attempts WHERE correct=1)'), week, week, 6);
			if (list.length < 6) {
				const ids = list.map((x) => x.id);
				list = list.concat(await q(sql(ids.length ? `AND id NOT IN (${ids.join(',')})` : ''), week, week, 6 - list.length));
			}
			return list;
		}
		case 'revision': // only real mistakes: nothing to replay means no session
			return unfixedMistakes(db, 5);
		case 'mock': {
			const list = await q("SELECT * FROM questions WHERE active=1 AND kind='mock' AND week=? ORDER BY id", week);
			if (list.length) return list;
			return q("SELECT * FROM questions WHERE active=1 AND kind IN ('practice','before','after','puzzle','diagnostic') AND week <= ? ORDER BY RANDOM() LIMIT 20", week);
		}
		default: { // practice
			let list = await q("SELECT * FROM questions WHERE active=1 AND kind='practice' AND week=? AND id NOT IN (SELECT question_id FROM attempts WHERE correct=1) ORDER BY RANDOM() LIMIT 4", week);
			list = await fill(list, 4, "SELECT * FROM questions WHERE active=1 AND kind='practice' AND week=? /*EXCL*/ ORDER BY RANDOM() LIMIT ?", week);
			return fill(list, 4, "SELECT * FROM questions WHERE active=1 AND kind='practice' AND week <= ? /*EXCL*/ ORDER BY RANDOM() LIMIT ?", Math.max(week, 1));
		}
	}
}
