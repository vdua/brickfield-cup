// A worksheet's own difficulty -> runs table (stored as JSON text, NULL = use the global RUNS_FOR).
import { RUNS_FOR } from '../content.js';

// Checks a table sent by the parent. Returns { text } (JSON or null) or { error }. Keys 1-3 only, values whole numbers >= 1, no cap.
export function parseRunsTable(raw) {
	if (raw === null || raw === undefined || raw === '') return { text: null };
	if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'runs_table must look like {"1":2,"2":4,"3":6}' };
	const entries = Object.entries(raw);
	if (!entries.length) return { text: null };
	const out = {};
	for (const [k, v] of entries) {
		if (!['1', '2', '3'].includes(k)) return { error: 'runs_table keys must be 1, 2 or 3 (the difficulty)' };
		if (!Number.isInteger(v) || v < 1) return { error: 'runs_table values must be whole numbers of at least 1' };
		out[k] = v;
	}
	return { text: JSON.stringify(out) };
}

// The table as an object, or null when the worksheet uses the global one.
export const tableOf = (w) => (w?.runs_table ? JSON.parse(w.runs_table) : null);

// Runs for a correct answer at difficulty d: the worksheet's table first, then the global one.
export const runsFor = (table, d) => table?.[d] || RUNS_FOR[d] || 4;
