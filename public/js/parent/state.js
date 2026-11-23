// Shared parent-dashboard state and small helpers.
export const main = document.getElementById('main');
export const tabs = document.getElementById('tabs');
export const ctx = { OV: null, pending: 0 }; // OV: cached /api/parent/overview, pending: reward requests waiting
export const TABS = [['overview', 'Overview'], ['plan', 'Week plan'], ['calendar', 'Calendar'], ['activity', 'Activity'], ['sessions', 'Sessions'], ['errors', 'Error notebook'], ['questions', 'Question bank'], ['family', 'Messages & rewards'], ['settings', 'Settings']];
export const KIND = { diagnostic: 'Diagnostic', before: 'Before-check', after: 'After-check', practice: 'Practice', puzzle: 'Puzzles', worksheet: 'Worksheet', revision: 'Replay (mistakes)', mock: 'Mock' };
export const MISTAKE = { careless: 'Silly slip', method: "Didn't know how", misread: 'Misread', guess: 'Guessed', untagged: 'Not tagged' };
export const MCOL = { careless: '#f08c00', method: '#1c7ed6', misread: '#e03131', guess: '#7048e8', untagged: '#ced4da' };
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
export const score = (x) => (x ? `${x.score}/${x.total}` : '—');
export const level = (p) => {
	if (p === null) return '';
	if (p >= 80) return 'good';
	return p >= 60 ? 'mid' : 'bad';
};

export function renderTabs(active) {
	tabs.innerHTML = TABS.map(([k, l]) => `<a href="#${k}" ${k === active ? 'aria-current="page"' : ''}>${l}${k === 'family' && ctx.pending ? ` <span class="dot">${ctx.pending}</span>` : ''}</a>`).join('');
}
