// Calendar: a Monday-to-Sunday grid of every mission of every plan week, plus what is still owed. Edit dates in the Week plan tab.
import { api, esc } from '/js/common.js';
import { main, renderTabs } from './state.js';

const STATUS = { locked: ['Later', ''], open: ['Today', 'mid'], missed: ['Missed', 'bad'], done: ['Done', 'good'], skip: ['Skipped', ''], na: ['No content', ''] };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const fmt = (d, o) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', ...o });
const mission = (x) => {
	const [text, cls] = x.late && x.status === 'done' ? ['Done late', 'bad'] : STATUS[x.status] || [x.status, ''];
	return `<a class="pill ${cls}" href="#plan/${x.week}" title="${esc(x.label)}${x.num ? ` ${x.num}` : ''}, week ${x.week}: ${esc(text)}. Edit in Week plan">${esc(x.label)}${x.num ? ` ${x.num}` : ''} <small>W${x.week}</small></a>`;
};
const offText = (o) => (o === 'nothing scheduled' ? 'No mission' : o.replace(/^holiday: ?/, 'Holiday: ').replace(/^./, (m) => m.toUpperCase()));

export async function calendar(arg) {
	renderTabs('calendar');
	const c = await api(`/parent/calendar${/^\d{4}-\d{2}-\d{2}$/.test(arg || '') ? `?from=${arg}` : ''}`);
	const cells = c.days.map((d, i) => {
		const head = i % 7 === 0 ? `<div class="wk">${fmt(d.day, { day: 'numeric', month: 'short' })} – ${fmt(addDays(d.day, 6), { day: 'numeric', month: 'short' })}</div>` : '';
		return `${head}<div class="cell ${d.off ? 'off' : ''} ${d.today ? 'today' : ''}">
      <div class="d"><b>${Number(d.day.slice(8))}</b><span>${d.day.slice(8) === '01' || i === 0 ? fmt(d.day, { month: 'short' }) : ''}${d.today ? ' · today' : ''}</span></div>
      ${d.missions.map(mission).join('')}${d.off ? `<span class="why">${esc(offText(d.off))}</span>` : ''}</div>`;
	}).join('');
	const owed = c.owed.length
		? `<p class="sub"><b>Still owed (${c.owed.length}):</b> ${c.owed.map(mission).join(' ')}<br>Reschedule or remove them in the Week plan tab.</p>`
		: `<p class="sub">Nothing owed from earlier days.</p>`;
	main.innerHTML = `<section class="card" style="max-width:980px"><h2>Calendar</h2>
    <p class="sub">All missions by date, across plan weeks (W2 = plan week 2). Grey days are not working days for his streak: a rest day, a holiday, or no mission scheduled. Tap a mission to edit its week.</p>
    ${owed}
    <div style="display:flex;gap:8px;margin:12px 0"><a class="btn light" href="#calendar/${addDays(c.from, -28)}">Previous 4 weeks</a><a class="btn light" href="#calendar">This week</a><a class="btn light" href="#calendar/${addDays(c.from, 28)}">Next 4 weeks</a></div>
    <div class="cal">${DOW.map((x) => `<div class="dow">${x}</div>`).join('')}${cells}</div></section>`;
}
