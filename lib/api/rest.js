// Rest weekdays (default Friday) and parent-set holidays: days with no play that never break the streak.
import { all, one } from './util.js';

const weekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Sunday ... 5 = Friday

// restReason(day) returns why the day is not a working day, or null.
export async function restRules(db) {
	const s = await one(db, "SELECT value FROM settings WHERE key='rest_days'");
	const weekdays = (s ? s.value : '5').split(',').filter((x) => x.trim() !== '').map(Number);
	const holidays = new Map((await all(db, 'SELECT day, note FROM holidays')).map((h) => [h.day, h.note || 'holiday']));
	const restReason = (d) => {
		if (holidays.has(d)) return `holiday: ${holidays.get(d)}`;
		return weekdays.includes(weekday(d)) ? 'rest day' : null;
	};
	return { restReason };
}
