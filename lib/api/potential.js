// Most runs the current week can still earn, for the parent to size rewards against.
// Every part runs from 0 (all wrong or not played) to its maximum (every answer right, hardest questions drawn).
import { ROADMAP, RUNS_FOR } from '../content.js';
import { all, one, istDay, nowIso, addDays } from './util.js';
import { workdayRules, streakState, BONUS_MAX } from './streak.js';
import { weekSlots, HAS_QUESTIONS } from './slots.js';
import { runsFor, tableOf } from './runs-table.js';

const val = (d) => RUNS_FOR[d] || 4;
const sum = (xs) => xs.reduce((a, x) => a + x, 0);

// Highest total when `n` questions are drawn: this week's pool first, then the fallback pool.
function best(primary, fallback, n) {
	const top = (list, k) => [...list].sort((a, b) => b - a).slice(0, k);
	const k = Math.min(n, primary.length); const
		rest = Math.min(n - k, fallback.length);
	return { n: k + rest, max: sum(top(primary, k)) + sum(top(fallback, rest)) };
}

// Regularity bonus for the week: what is already banked, plus what he can still bank by playing every
// remaining working day, continuing from the streak he is on now (1, 2, ... up to the cap).
async function weekBonus(db, road, today) {
	const { off } = await workdayRules(db);
	const days = Array.from({ length: 7 }, (_, i) => addDays(road.start, i)).filter((d) => !off(d));
	const paid = Object.fromEntries((await all(db, 'SELECT day, runs FROM daily_bonus WHERE day BETWEEN ? AND ?', road.start, addDays(road.start, 6))).map((r) => [r.day, r.runs]));
	const st = await streakState(db, today);
	const inWeek = today >= road.start && today <= addDays(road.start, 6);
	let streak = inWeek ? st.streak : 0;
	let left = 0;
	// days already banked, or past days that paid nothing, are skipped
	const unplayed = days.filter((x) => paid[x] === undefined && x >= today).length;
	for (let i = 0; i < unplayed; i++) {
		streak += 1; // an unplayed working day: playing it extends the streak
		left += Math.min(streak, BONUS_MAX);
	}
	const banked = sum(Object.values(paid));
	return { days: days.length, banked, max: banked + left };
}

export async function weekPotential(db, week) {
	const road = ROADMAP[week - 1];
	if (!road) return null;
	const today = istDay(nowIso());
	const qs = await all(db, 'SELECT kind, week, difficulty FROM questions WHERE active=1 AND worksheet_id IS NULL AND week IN (0, ?, ?)', week, Math.max(week - 1, 1));
	const pool = (kind, wk) => qs.filter((q) => q.kind === kind && q.week === wk).map((q) => val(q.difficulty));
	// slots on a rest day or holiday are skipped and earn nothing; missed ones can still be caught up, so they stay in
	const planned = (await weekSlots(db, week, today)).slots;
	const open = (kind) => planned.filter((s) => s.kind === kind && s.status !== 'skip').length;
	const parts = [
		{ label: 'Toss (before-check)', n: 0, max: 0, ...(open('before') ? best(pool('before', week), [], 99) : {}) },
		{ label: 'Nets (practice)', ...best(pool('practice', week), [...pool('practice', week - 1), ...pool('practice', 0)], open('practice') * 4) },
		{ label: 'Spin puzzle', ...(open('puzzle') ? best(pool('puzzle', week), pool('puzzle', 0), 6) : { n: 0, max: 0 }) },
		{ label: 'Super over (after-check)', n: 0, max: 0, ...(open('after') ? best(pool('after', week), [], 99) : {}) },
	];
	const sheets = open('worksheet') ? await all(db, `SELECT q.difficulty, w.runs_table FROM worksheets w JOIN questions q ON q.worksheet_id=w.id AND q.active=1 WHERE w.id=(SELECT MAX(w.id) FROM worksheets w WHERE w.active=1 AND w.week=? AND ${HAS_QUESTIONS})`, week) : [];
	if (sheets.length) parts.push({ label: 'Match (worksheet)', n: sheets.length, max: sum(sheets.map((s) => runsFor(tableOf(s), s.difficulty))) });
	const bonus = await weekBonus(db, road, today);
	const earned = (await one(db, 'SELECT COALESCE(SUM(runs),0) n FROM sessions WHERE week=? AND ended_at IS NOT NULL', week))?.n || 0;
	const hasQuestions = qs.some((q) => q.week === week) || sheets.length > 0;
	const total = { max: sum(parts.map((p) => p.max)) + bonus.max };
	return {
		week, topic: road.topic, hasQuestions, parts, bonus, earned, total,
	};
}
