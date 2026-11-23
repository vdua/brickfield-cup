// Regularity streak: one bonus per working day (1, 2, ... capped at BONUS_MAX runs).
// A working day is not a rest day, not a holiday, and has a playable mission scheduled on it.
// Missing one resets the streak; any other day is skipped and never breaks it.
// Replay (revision) is an extra: it never counts toward the streak, its bonus or its wickets.
// Every WICKETS_PER_RESET wickets (wrong or skipped answers) also reset it.
import { all, one, run, istDay, nowIso, addDays } from './util.js';
import { restRules } from './rest.js';
import { playableDays } from './slots.js';

export { restRules };

export const BONUS_MAX = 6;
export const WICKETS_PER_RESET = 10;
// off(day) returns why the day is not a working day (rest day, holiday, nothing scheduled), or null.
export async function workdayRules(db) {
	const { restReason } = await restRules(db);
	const playable = await playableDays(db);
	const off = (d) => restReason(d) || (playable.has(d) ? null : 'nothing scheduled');
	return { restReason, off };
}

const missedWorkingDay = (restReason, from, to) => {
	for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) if (!restReason(d)) return true;
	return false;
};

// sessions: [{ day, wickets }] oldest first. Pure, so it can be tested without a database.
export function replay(sessions, restReason, today) {
	let streak = 0; let wick = 0; let
		last = null;
	const dayBonus = new Map();
	for (const { day, wickets } of sessions) {
		if (!restReason(day)) {
			if (day !== last) {
				if (last && missedWorkingDay(restReason, last, day)) streak = 0;
				streak += 1;
				dayBonus.set(day, Math.min(streak, BONUS_MAX));
				last = day;
			}
			wick += wickets;
			while (wick >= WICKETS_PER_RESET) { wick -= WICKETS_PER_RESET; streak = 0; }
		}
	}
	const todayOff = !!restReason(today);
	const lapsed = last && last !== today && missedWorkingDay(restReason, last, today);
	const current = lapsed ? 0 : streak;
	const playedToday = last === today;
	return {
		streak: current,
		dayBonus,
		wicketsLeft: WICKETS_PER_RESET - wick,
		nextBonus: playedToday || todayOff ? null : Math.min(current + 1, BONUS_MAX),
		playedToday,
	};
}

export async function streakState(db, today = istDay(nowIso())) {
	const { restReason, off } = await workdayRules(db);
	const rows = await all(db, "SELECT ended_at, wickets FROM sessions WHERE ended_at IS NOT NULL AND kind != 'revision' ORDER BY ended_at, id");
	const st = replay(rows.map((r) => ({ day: istDay(r.ended_at), wickets: r.wickets })), off, today);
	return { ...st, rest: restReason(today), idle: !restReason(today) && !!off(today) };
}

// The reason today is not a working day, or null. Used to block new sessions.
export async function restToday(db) {
	return (await restRules(db)).restReason(istDay(nowIso()));
}

// Pays the day's bonus once, on the first finished session of a working day. Returns { runs, streak }.
export async function awardBonus(db, endedAt) {
	const day = istDay(endedAt);
	const st = await streakState(db, day);
	const runs = st.dayBonus.get(day) || 0;
	if (!runs || await one(db, 'SELECT 1 x FROM daily_bonus WHERE day=?', day)) return { runs: 0, streak: st.streak };
	await run(db, 'INSERT INTO daily_bonus(day, runs, created_at) VALUES (?, ?, ?)', day, runs, endedAt);
	return { runs, streak: st.streak };
}
