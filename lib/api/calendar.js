// Parent calendar: every mission of every plan week laid out by date, with why a day is or isn't a working day.
import { all, istDay, nowIso, addDays } from './util.js';
import { weekSlots, owedSlots, slotContext } from './slots.js';
import { workdayRules } from './streak.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const mondayOf = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

// days: `count` consecutive days from `from` (default: this week's Monday). owed: unfinished missions dated before today.
export async function calendar(db, from, count = 28) {
	const today = istDay(nowIso());
	const start = DAY_RE.test(String(from)) ? from : mondayOf(today);
	const n = Math.max(1, Math.min(70, Number(count) || 28));
	const end = addDays(start, n - 1);
	const weeks = await all(db, 'SELECT DISTINCT week FROM week_slots WHERE day BETWEEN ? AND ? ORDER BY week', start, end);
	const shared = await slotContext(db);
	const byDay = new Map();
	for (const { week } of weeks) {
		for (const x of (await weekSlots(db, week, today, shared)).slots) {
			if (x.day >= start && x.day <= end) byDay.set(x.day, [...(byDay.get(x.day) || []), x]);
		}
	}
	const { off } = await workdayRules(db);
	const days = Array.from({ length: n }, (_, i) => {
		const day = addDays(start, i);
		return { day, today: day === today, off: off(day), missions: byDay.get(day) || [] };
	});
	return { from: start, to: end, today, days, owed: await owedSlots(db, today, 0, shared) };
}
