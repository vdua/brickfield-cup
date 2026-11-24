// Weekly mission slots. The parent publishes a week once; each slot then opens on its day.
// A past slot he missed stays playable (as a late catch-up); a future slot never is.
// A day allows as many missions as the parent scheduled on it (at least one; the worksheet Match is exempt), so a week can't be binged.
import { ROADMAP } from '../content.js';
import { json, fail, all, one, run, istDay, nowIso, addDays } from './util.js';
import { restRules } from './rest.js';

// A mission is a slot of a plan week: its questions come from that week, its date is whatever the parent sets.
// Nets and Spin puzzle can be added or removed freely. Toss, Match and Super over are one per week (each week has its own questions).
// off = days after the week's Monday, used only for the default dates of a freshly published week.
export const PLAN = [
	{ slot: 'nets1', kind: 'practice', label: 'Nets', hint: 'Practice · 4 balls', off: 0 },
	{ slot: 'nets2', kind: 'practice', label: 'Nets', hint: 'Practice · 4 balls', off: 1 },
	{ slot: 'nets3', kind: 'practice', label: 'Nets', hint: 'Practice · 4 balls', off: 2 },
	{ slot: 'puzzle', kind: 'puzzle', label: 'Spin puzzle', hint: 'Brain-teasers · 6 balls', off: 3 },
	{ slot: 'toss', kind: 'before', label: 'Toss', hint: 'Before-check · 6 balls', off: 5 },
	{ slot: 'match', kind: 'worksheet', label: 'Match', hint: 'Worksheet', off: 5 },
	{ slot: 'over', kind: 'after', label: 'Super over', hint: 'After-check · 6 balls', off: 6 },
];
const BASES = {
	nets: { kind: 'practice', label: 'Nets', hint: 'Practice · 4 balls', order: 0, many: true },
	puzzle: { kind: 'puzzle', label: 'Spin puzzle', hint: 'Brain-teasers · 6 balls', order: 1, many: true },
	toss: { kind: 'before', label: 'Toss', hint: 'Before-check · 6 balls', order: 2 },
	match: { kind: 'worksheet', label: 'Match', hint: 'Worksheet', order: 3 },
	over: { kind: 'after', label: 'Super over', hint: 'After-check · 6 balls', order: 4 },
};
// "nets4" -> { base: "nets", num: "4", ...BASES.nets }; null when the name is not a valid slot.
export function slotInfo(slot) {
	const m = /^(nets|puzzle|toss|match|over)([1-9]\d?)?$/.exec(String(slot));
	if (!m || (m[2] && !BASES[m[1]].many) || (m[1] === 'nets' && !m[2])) return null;
	return { base: m[1], num: m[2] || '', ...BASES[m[1]] };
}
export const GATED = new Set(Object.values(BASES).map((b) => b.kind));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const startOfDayIso = (day) => new Date(`${day}T00:00:00+05:30`).toISOString();

export const defaultDays = (week) => Object.fromEntries(
	PLAN.map((p) => [p.slot, addDays(ROADMAP[week - 1].start, p.off)]),
);

// A worksheet with no active questions yet (mid-upload) or any more counts for nothing.
export const HAS_QUESTIONS = 'EXISTS (SELECT 1 FROM questions q WHERE q.worksheet_id=w.id AND q.active=1)';

async function hasContent(db, week) {
	const n = async (sql, ...b) => ((await one(db, sql, ...b))?.n || 0) > 0;
	return {
		before: await n("SELECT COUNT(*) n FROM questions WHERE active=1 AND kind='before' AND week=?", week),
		after: await n("SELECT COUNT(*) n FROM questions WHERE active=1 AND kind='after' AND week=?", week),
		worksheet: await n(`SELECT COUNT(*) n FROM worksheets w WHERE w.active=1 AND w.week=? AND ${HAS_QUESTIONS}`, week),
	};
}

// Days on which the kid has a playable mission scheduled (a published slot with its questions loaded).
export async function playableDays(db) {
	const rows = await all(db, 'SELECT week, slot, day FROM week_slots');
	const content = new Map();
	const days = new Set();
	for (const r of rows) {
		const info = slotInfo(r.slot);
		if (info) {
			if (!content.has(r.week)) content.set(r.week, await hasContent(db, r.week));
			if (content.get(r.week)[info.kind] !== false) days.add(r.day);
		}
	}
	return days;
}

// Status of every slot of a week as seen on `today` (an IST day), by date then kind.
// done | skip (rest day) | na (no content yet) | unpublished | locked (future) | open (today) | missed (past, still playable)
export async function weekSlots(db, week, today) {
	const road = ROADMAP[week - 1];
	if (!road) return null;
	const rows = await all(db, 'SELECT slot, day FROM week_slots WHERE week=?', week);
	const published = rows.length > 0;
	const plan = published ? rows : Object.entries(defaultDays(week)).map(([slot, day]) => ({ slot, day })); // unpublished: show the standard week
	const finished = await all(db, 'SELECT id, slot, ended_at, score, total FROM sessions WHERE week=? AND slot IS NOT NULL AND ended_at IS NOT NULL ORDER BY id', week);
	const doneBy = new Map();
	for (const s of finished) if (!doneBy.has(s.slot)) doneBy.set(s.slot, s);
	const { restReason } = await restRules(db);
	const have = await hasContent(db, week);
	const slots = plan.filter((r) => slotInfo(r.slot)).map(({ slot, day }) => {
		const info = slotInfo(slot);
		const d = doneBy.get(slot);
		let status;
		if (d) status = 'done';
		else if (!published) status = 'unpublished';
		else if (restReason(day)) status = 'skip';
		else if (have[info.kind] === false) status = 'na';
		else if (day > today) status = 'locked';
		else status = day === today ? 'open' : 'missed';
		return {
			slot,
			week,
			base: info.base,
			num: info.num,
			kind: info.kind,
			label: info.label,
			hint: info.hint,
			day,
			status,
			late: !!d && istDay(d.ended_at) > day,
			score: d ? d.score : null,
			total: d ? d.total : null,
		};
	}).sort((x, y) => x.day.localeCompare(y.day) || BASES[x.base].order - BASES[y.base].order || x.slot.localeCompare(y.slot, 'en', { numeric: true }));
	return { week, published, slots };
}

// What the kid sees: every mission of any plan week dated in the next `ahead` days (locked until its day),
// plus every earlier one he has not finished (still playable as a late catch-up).
export async function upcoming(db, today, ahead = 7) {
	const horizon = addDays(today, ahead);
	const weeks = await all(db, `SELECT DISTINCT w.week FROM week_slots w WHERE w.day <= ? AND (w.day >= ?
    OR NOT EXISTS (SELECT 1 FROM sessions s WHERE s.week=w.week AND s.slot=w.slot AND s.ended_at IS NOT NULL)) ORDER BY w.week`, horizon, today);
	const out = [];
	for (const { week } of weeks) {
		for (const x of (await weekSlots(db, week, today)).slots) {
			if ((x.day >= today && x.day <= horizon) || x.status === 'missed') out.push(x);
		}
	}
	return out.sort((x, y) => x.day.localeCompare(y.day)
		|| BASES[x.base].order - BASES[y.base].order
		|| x.week - y.week);
}

// Missions of other plan weeks he still owes (dated before today, not finished), for the parent to reschedule.
export async function owedSlots(db, today, exceptWeek) {
	const weeks = await all(db, `SELECT DISTINCT w.week FROM week_slots w WHERE w.day < ? AND w.week != ? AND NOT EXISTS (
    SELECT 1 FROM sessions s WHERE s.week=w.week AND s.slot=w.slot AND s.ended_at IS NOT NULL) ORDER BY w.week`, today, exceptWeek);
	const out = [];
	for (const { week } of weeks) out.push(...(await weekSlots(db, week, today)).slots.filter((x) => x.status === 'missed'));
	return out;
}

// Missions of other plan weeks relevant to planning `week`: any dated within its 7 days (e.g. last week's Match moved here)
// plus everything still owed. Sorted by date.
export async function otherWeekSlots(db, today, week) {
	const { start } = ROADMAP[week - 1];
	const inRange = await all(db, 'SELECT DISTINCT week FROM week_slots WHERE week != ? AND day BETWEEN ? AND ?', week, start, addDays(start, 6));
	const out = new Map();
	for (const { week: wk } of inRange) {
		for (const x of (await weekSlots(db, wk, today)).slots) if (x.day >= start && x.day <= addDays(start, 6)) out.set(`${wk}/${x.slot}`, x);
	}
	for (const x of await owedSlots(db, today, week)) out.set(`${x.week}/${x.slot}`, x);
	return [...out.values()].sort((a, b) => a.day.localeCompare(b.day) || a.week - b.week);
}

// A week is "clean" when every slot that could be played was finished on its own day (at least one was).
export const cleanWeek = (w) => w.slots.some((s) => s.status === 'done')
  && w.slots.every((s) => (s.status === 'done' && !s.late) || s.status === 'skip' || s.status === 'na');

const WHY = {
	unpublished: "Dad hasn't published this week yet.",
	locked: "This one isn't open yet. It unlocks on its day.",
	skip: 'No play on this day (rest day or holiday).',
	na: 'No questions here yet. Ask Dad to add some!',
	done: 'You already finished this one.',
};

// Checks a kid request to start a gated session. Returns { error, code } or { slot, week, kind, worksheetId }.
export async function slotForStart(db, body, today, curWeek) {
	const week = Number(body.week) || curWeek;
	const w = await weekSlots(db, week, today);
	const slot = w?.slots.find((s) => s.slot === body.slot);
	if (!slot) return { code: 400, error: "Pick a mission from this week's plan." };
	if (slot.status !== 'open' && slot.status !== 'missed') {
		const codes = { done: 409, na: 404 };
		return { code: codes[slot.status] || 403, error: WHY[slot.status] };
	}
	if (slot.kind !== 'worksheet') {
		// today's allowance is the number of missions the parent scheduled for today
		// (at least 1, so a day with none can still be used for a catch-up)
		const sched = (await one(db, "SELECT COUNT(*) n FROM week_slots WHERE day=? AND slot != 'match'", today))?.n || 0;
		const claimed = await all(db, "SELECT DISTINCT week, slot FROM sessions WHERE slot IS NOT NULL AND kind != 'worksheet' AND started_at >= ?", startOfDayIso(today));
		const retry = claimed.some((c) => c.week === week && c.slot === slot.slot); // an unfinished try of the same one can be restarted
		if (!retry && claimed.length >= Math.max(1, sched)) return { code: 403, error: sched > 1 ? "That's all of today's missions. Come back tomorrow!" : 'One mission a day. Come back tomorrow!' };
	}
	let worksheetId = null;
	if (slot.kind === 'worksheet') worksheetId = (await one(db, `SELECT w.id FROM worksheets w WHERE w.active=1 AND w.week=? AND ${HAS_QUESTIONS} ORDER BY w.id DESC LIMIT 1`, week))?.id || null;
	return { slot: slot.slot, week, kind: slot.kind, worksheetId };
}

// Slot a worksheet submission may complete. Returns { error, code } or { slot } (slot is null for repeats and week-0 sheets).
export async function slotForSheet(db, w, today) {
	if (!w.week) return { slot: null };
	const s = (await weekSlots(db, w.week, today))?.slots.find((x) => x.slot === 'match');
	if (!s) return { slot: null };
	if (s.status === 'done') return { slot: null };
	if (s.status === 'open' || s.status === 'missed') return { slot: 'match' };
	return { code: s.status === 'locked' || s.status === 'unpublished' ? 403 : 400, error: WHY[s.status] || 'Not available.' };
}

const VALID_DAY = (d) => DAY_RE.test(String(d));

export async function slotParentRoutes({ db, method, body, seg }) {
	if (seg[1] !== 'plan') return null;
	const week = Number(seg[2]);
	if (!Number.isInteger(week) || week < 1 || week > ROADMAP.length) return fail(400, 'Pick a week from 1 to 19');
	const view = async (at = istDay(nowIso())) => ({ ...(await weekSlots(db, week, at)), addable: ['nets', 'puzzle'], owed: await owedSlots(db, at, week), others: await otherWeekSlots(db, at, week) });
	if (method === 'GET' && !seg[3]) return json(await view());
	if (method === 'POST' && seg[3] === 'publish') {
		// a new week starts from the standard 7 missions; a published week only changes the dates it is sent
		const existing = await all(db, 'SELECT slot, day FROM week_slots WHERE week=?', week);
		const current = existing.length
			? existing.map((r) => [r.slot, r.day])
			: Object.entries(defaultDays(week));
		const days = Object.fromEntries(current);
		for (const [slot, day] of Object.entries(body.days && typeof body.days === 'object' ? body.days : {})) {
			if (!slotInfo(slot)) return fail(400, `Unknown mission ${slot}`);
			if (!VALID_DAY(day)) return fail(400, `Pick a date for ${slotInfo(slot).label}`);
			if (existing.length && !(slot in days)) return fail(400, 'Use Add to schedule a new mission');
			days[slot] = day;
		}
		if (days.toss && days.over && days.toss > days.over) return fail(400, 'The Toss has to come on or before the Super over');
		const now = nowIso();
		await db.batch(Object.entries(days).map(([slot, day]) => db.prepare('INSERT INTO week_slots(week, slot, day, published_at) VALUES (?, ?, ?, ?) ON CONFLICT(week, slot) DO UPDATE SET day=excluded.day').bind(week, slot, day, now)));
		return json(await view(istDay(now)));
	}
	if (method === 'POST' && seg[3] === 'add') { // one more Nets or Spin puzzle for this week's questions
		const base = String(body.kind);
		if (!BASES[base]?.many) return fail(400, 'Only Nets and Spin puzzle can be added; Toss, Match and Super over are one per week');
		if (!VALID_DAY(body.day)) return fail(400, 'Pick a date');
		const have = new Set((await all(db, 'SELECT slot FROM week_slots WHERE week=?', week)).map((r) => r.slot));
		if (!have.size) return fail(400, 'Publish the week first');
		const name = (n) => (base === 'puzzle' && n === 1 ? 'puzzle' : `${base}${n}`);
		let n = 1;
		while (have.has(name(n))) n += 1;
		if (!slotInfo(name(n))) return fail(400, 'That is enough of those for one week');
		await run(db, 'INSERT INTO week_slots(week, slot, day, published_at) VALUES (?, ?, ?, ?)', week, name(n), body.day, nowIso());
		return json(await view());
	}
	if (method === 'DELETE' && seg[3]) { // drop one mission; a finished one stays in his record, so it cannot be removed
		if (!await one(db, 'SELECT 1 x FROM week_slots WHERE week=? AND slot=?', week, seg[3])) return fail(404, 'No such mission');
		if (await one(db, 'SELECT 1 x FROM sessions WHERE week=? AND slot=? AND ended_at IS NOT NULL', week, seg[3])) return fail(409, 'He already finished that one');
		await run(db, 'DELETE FROM week_slots WHERE week=? AND slot=?', week, seg[3]);
		return json(await view());
	}
	if (method === 'DELETE' && !seg[3]) { // unpublish: the kid sees the week locked again; finished sessions keep their slot
		await run(db, 'DELETE FROM week_slots WHERE week=?', week);
		return json(await view());
	}
	return null;
}
