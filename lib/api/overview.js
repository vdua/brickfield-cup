// Parent dashboard overview, in independent parts so the page can fill in tile by tile (GET /parent/overview/<part>).
// GET /parent/overview still returns every part merged.
import { ROADMAP, BADGES, STADIUM } from '../content.js';
import { all, istDay } from './util.js';
import { getSettings, currentWeek } from './settings.js';
import { totals, stageFor } from './stats.js';
import { streakState } from './streak.js';
import { weekPotential } from './potential.js';

// week, settings, weekly tracker, last 28 days, totals, reward requests: the page header, KPI tiles, tracker and daily chart
async function core(db) {
	const s = await getSettings(db);
	const week = currentWeek(s);
	const sessions = await all(db, 'SELECT * FROM sessions WHERE ended_at IS NOT NULL ORDER BY ended_at');
	const careless = await all(db, "SELECT s.week, COUNT(*) n FROM attempts a JOIN sessions s ON s.id=a.session_id WHERE a.mistake='careless' GROUP BY s.week");
	const carelessBy = Object.fromEntries(careless.map((r) => [r.week, r.n]));
	const tracker = ROADMAP.map((r) => {
		const ws = sessions.filter((x) => x.week === r.week);
		const last = (k) => ws.filter((x) => x.kind === k).slice(-1)[0] || null;
		const first = (k) => ws.find((x) => x.kind === k) || null;
		const prac = ws.filter((x) => x.kind === 'practice');
		const pc = prac.reduce((a, x) => a + x.score, 0); const
			pt = prac.reduce((a, x) => a + x.total, 0);
		const before = first('before');
		const after = last('after');
		const mock = last('mock');
		return {
			week: r.week,
			topic: r.topic,
			phase: r.phase,
			start: r.start,
			before: before ? { score: before.score, total: before.total } : null,
			after: after ? { score: after.score, total: after.total } : null,
			mock: mock ? { score: mock.score, total: mock.total } : null,
			practice: pt ? { pct: Math.round((pc / pt) * 100), sessions: prac.length } : null,
			careless: carelessBy[r.week] || 0,
			minutes: Math.round(ws.reduce((a, x) => a + Math.max(0, x.duration_s - x.away_s), 0) / 60),
		};
	});
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
		week,
		settings: s,
		tracker,
		daily,
		totals: t,
		stage: STADIUM[stageFor(t.runs)].name,
		pendingRewards: await all(db, "SELECT * FROM rewards WHERE status='requested'"),
	};
}

const streak = async (db) => ({ streak: (await streakState(db)).streak });

async function weekMax(db) {
	return { weekMax: await weekPotential(db, currentWeek(await getSettings(db))) };
}

async function badges(db) {
	return { badges: (await all(db, 'SELECT code, earned_at FROM badges ORDER BY earned_at DESC')).map((b) => ({ ...BADGES.find((x) => x.code === b.code), earned_at: b.earned_at })) };
}

// all-time accuracy per topic (with the last 15 answers) and why answers were wrong
async function topicStats(db) {
	const topics = await all(db, `SELECT q.topic, COUNT(*) n, SUM(a.correct) c, AVG(a.time_ms) t,
      SUM(CASE WHEN a.mistake='careless' THEN 1 ELSE 0 END) careless
    FROM attempts a JOIN questions q ON q.id=a.question_id GROUP BY q.topic ORDER BY q.topic`);
	const recentTopics = await all(db, `SELECT q.topic, a.correct FROM attempts a JOIN questions q ON q.id=a.question_id ORDER BY a.id DESC LIMIT 400`);
	const recentBy = {};
	for (const r of recentTopics) {
		recentBy[r.topic] ||= [];
		if (recentBy[r.topic].length < 15) recentBy[r.topic].push(r.correct);
	}
	const mistakes = await all(db, "SELECT COALESCE(mistake,'untagged') m, COUNT(*) n FROM attempts WHERE correct=0 GROUP BY 1");
	return {
		topics: topics.map((r) => ({
			topic: r.topic,
			attempts: r.n,
			accuracy: Math.round((r.c / r.n) * 100),
			avgSec: Math.round((r.t || 0) / 1000),
			careless: r.careless,
			recent: recentBy[r.topic] || [],
		})),
		mistakes,
	};
}

export const OVERVIEW_PARTS = { core, streak, 'week-max': weekMax, badges, topics: topicStats };

export async function parentOverview(db) {
	return Object.assign({}, ...(await Promise.all(Object.values(OVERVIEW_PARTS).map((part) => part(db)))));
}
