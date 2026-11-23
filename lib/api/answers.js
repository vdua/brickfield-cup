// Answer checking and question presentation.
const UNIT_RE = new RegExp([
	'₹', 'rs\\.?', 'km/h', 'kmph', 'degrees?', '°', 'minutes?', 'mins?', 'hours?', 'hrs?', 'litres?', 'liters?',
	'metres?', 'meters?', 'cm', 'km', 'kg', 'runs?', '\\bl\\b', '\\bm\\b', '\\bh\\b', '\\bg\\b', ',',
].join('|'), 'gi');
function toNumber(raw) {
	const s = String(raw ?? '').toLowerCase().replace(UNIT_RE, '').replace(/\s+/g, ' ')
		.trim();
	if (!s) return NaN;
	let m = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/); // mixed number 4 1/6
	if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
	m = s.match(/^(-?\d*\.?\d+)\s*\/\s*(\d*\.?\d+)$/);
	if (m) return Number(m[1]) / Number(m[2]);
	return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
export function isCorrect(q, given) {
	if (given === null || given === undefined || String(given).trim() === '') return false;
	if (q.options) return String(given).trim() === String(q.answer).trim();
	const a = toNumber(q.answer); const
		g = toNumber(given);
	if (!Number.isNaN(a) && !Number.isNaN(g)) return Math.abs(a - g) < 1e-6;
	const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
	return norm(given) === norm(q.answer);
}
export const displayAnswer = (q) => (q.options ? JSON.parse(q.options)[Number(q.answer)] : q.answer);
export const publicQ = (q) => ({
	id: q.id,
	topic: q.topic,
	difficulty: q.difficulty,
	prompt: q.prompt,
	options: q.options ? JSON.parse(q.options) : null,
});
