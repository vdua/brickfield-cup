// Pure helpers for the Add worksheet form: difficulty ranges, validation and the preview numbers. No DOM here.
const GLOBAL_RUNS = { 1: 2, 2: 4, 3: 6 }; // same fallback as RUNS_FOR on the server

// "46-50=3, 7=2" -> [{ from: 46, to: 50, d: 3 }, { from: 7, to: 7, d: 2 }]. Returns { ranges } or { error }.
export function parseRanges(text) {
	const ranges = [];
	for (const part of String(text || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
		const m = part.match(/^(?:q\s*)?(\d+)(?:\s*[-–]\s*(?:q\s*)?(\d+))?\s*[=:]\s*d?([123])$/i);
		if (!m) return { error: `Cannot read "${part}". Use e.g. 1-45=1, 46-50=3` };
		const from = Number(m[1]);
		const to = Number(m[2] || m[1]);
		if (from < 1 || to < from) return { error: `"${part}" is not a valid question range` };
		ranges.push({ from, to, d: Number(m[3]) });
	}
	return { ranges };
}

// Sets d on every question inside a range (question numbers start at 1); later ranges win.
export const applyRanges = (questions, ranges) => questions.map((q, i) => {
	const hit = ranges.filter((r) => i + 1 >= r.from && i + 1 <= r.to).pop();
	return hit ? { ...q, d: hit.d } : q;
});

// Everything the server would reject, and what the paper format promises. Returns a list of plain sentences.
export function problems(questions) {
	if (!questions.length) return ['No questions in the file'];
	const out = [];
	questions.forEach((q, i) => {
		const n = `Q${i + 1}`;
		if (!String(q.q ?? '').trim()) out.push(`${n}: no question text`);
		if (!Array.isArray(q.o) || q.o.length !== 4) out.push(`${n}: needs exactly 4 options (has ${Array.isArray(q.o) ? q.o.length : 0})`);
		else if (!Number.isInteger(Number(q.a)) || Number(q.a) < 0 || Number(q.a) > 3) out.push(`${n}: answer must be 0 to 3`);
		if (![1, 2, 3].includes(Number(q.d))) out.push(`${n}: difficulty must be 1, 2 or 3`);
	});
	return out;
}

// Runs for a correct answer at difficulty d under the table the parent typed (blank keys use the global table).
export const runsFor = (table, d) => table?.[d] || GLOBAL_RUNS[d] || 4;

// Count, consecutive same-difficulty groups ("Q1-45 d1") and the most runs the sheet can pay.
export function preview(questions, table) {
	const groups = [];
	questions.forEach((q, i) => {
		const last = groups[groups.length - 1];
		if (last && last.d === Number(q.d)) last.to = i + 1;
		else groups.push({ from: i + 1, to: i + 1, d: Number(q.d) });
	});
	return { count: questions.length, groups, max: questions.reduce((s, q) => s + runsFor(table, Number(q.d)), 0) };
}

export const groupText = (g) => `Q${g.from}${g.to > g.from ? `-${g.to}` : ''} d${g.d}`;
