// "Week plan": publish a week once, then each mission opens on its day. Dates can be changed, and Nets or Spin puzzles added or removed, before or after publishing.
import { api, esc, toast } from '/js/common.js';
import { main, ctx, renderTabs } from './state.js';

const STATUS = {
	unpublished: ['Not published', ''],
	locked: ['Opens later', ''],
	open: ['Open today', 'mid'],
	missed: ['Missed (can catch up)', 'bad'],
	done: ['Done', 'good'],
	skip: ['Rest day, skipped', ''],
	na: ['No content yet', ''],
};

export async function plan(arg) {
	renderTabs('plan');
	if (!ctx.OV) ctx.OV = await api('/parent/overview');
	const week = Math.max(1, Math.min(19, Number(arg) || ctx.OV.week));
	const w = await api(`/parent/plan/${week}`);
	const row = (x) => {
		const [text, cls] = x.late && x.status === 'done' ? ['Done late (mission failed)', 'bad'] : STATUS[x.status];
		return `<tr><td data-l="Mission"><b>${esc(x.label)}${x.num ? ` ${x.num}` : ''}</b><br><small>${esc(x.hint)}</small></td>
      <td data-l="Day"><input type="date" data-slot="${x.slot}" value="${esc(x.day)}" required></td>
      <td data-l="Status"><span class="pill ${cls}">${esc(text)}</span>${x.score !== null && x.total ? ` <small>${x.score}/${x.total}</small>` : ''}</td>
      <td>${w.published && x.status !== 'done' ? `<button class="btn light" type="button" data-drop="${x.slot}" aria-label="Remove ${esc(x.label)}">Remove</button>` : ''}</td></tr>`;
	};
	const otherRow = (x) => {
		const [text, cls] = x.late && x.status === 'done' ? ['Done late (mission failed)', 'bad'] : STATUS[x.status];
		return `<tr><td data-l="Mission"><b>${esc(x.label)}${x.num ? ` ${x.num}` : ''}</b> <small>Week ${x.week}</small><br><small>${esc(x.hint)}</small></td>
      <td data-l="Day"><input type="date" data-slot="${x.slot}" data-week="${x.week}" value="${esc(x.day)}" required></td>
      <td data-l="Status"><span class="pill ${cls}">${esc(text)}</span></td>
      <td>${x.status !== 'done' ? `<button class="btn light" type="button" data-drop="${x.slot}" data-week="${x.week}" aria-label="Remove ${esc(x.label)}">Remove</button>` : ''}</td></tr>`;
	};
	main.innerHTML = `<section class="card" style="max-width:760px"><h2>Week plan</h2>
    <p class="sub">Publish a week once. Each mission then opens on its day: he can play today's, and catch up on missed ones (the mission counts as failed and the streak is lost), but never play ahead. He can play as many missions in a day as you schedule on it (at least one). Days that are rest days or holidays are skipped.</p>
    <label class="field" style="max-width:260px">Week<select id="pw">${ctx.OV.tracker.map((t) => `<option value="${t.week}" ${t.week === week ? 'selected' : ''}>Week ${t.week}: ${esc(t.topic)}</option>`).join('')}</select></label>
    <p class="sub" style="margin-top:12px">${w.published ? 'Published. Change a date and save to move a mission.' : 'Not published yet. He sees the week but cannot play any of it.'}</p>
    <form id="pf"><table><thead><tr><th>Mission</th><th>Day</th><th>Status</th><th></th></tr></thead><tbody>${w.slots.map(row).join('')}</tbody></table>
    <div style="margin-top:12px;display:flex;gap:8px"><button class="btn green" type="submit">${w.published ? 'Save dates' : 'Publish week'}</button>
    ${w.published ? `<button class="btn light" type="button" id="unpub">Unpublish</button>` : ''}</div></form>
    <h3 style="margin-top:20px">Other weeks' missions</h3>
    ${w.others.length ? `<p class="sub">Missions of other plan weeks that fall on this week's dates (for example last week's Match moved here), plus anything he missed and still owes. Pick a new date to reschedule (it then counts on time), or remove it. Save dates to apply.</p>
      <table><thead><tr><th>Mission</th><th>Day</th><th>Status</th><th></th></tr></thead><tbody>${w.others.map(otherRow).join('')}</tbody></table>` : `<p class="sub">None. Missions of other weeks dated in this week, or missed and still owed, will be listed here.</p>`}
    ${w.published ? `<div style="margin-top:16px;display:flex;gap:8px;align-items:end;flex-wrap:wrap"><label class="field" style="margin:0">Add a mission on<input type="date" id="adday" value="${esc(w.slots.at(-1)?.day || '')}"></label>
      <button class="btn light" type="button" data-add="nets">Add Nets</button><button class="btn light" type="button" data-add="puzzle">Add Spin puzzle</button></div>` : ''}</section>`;
	main.querySelector('#pw').onchange = (e) => { location.hash = `plan/${e.target.value}`; };
	main.querySelector('#pf').addEventListener('submit', async (e) => {
		e.preventDefault();
		const byWeek = { [week]: {} }; // this week sends every date; other weeks only the ones that changed
		main.querySelectorAll('input[data-slot]').forEach((i) => {
			const wk = i.dataset.week || week;
			if (wk === week || i.value !== i.defaultValue) (byWeek[wk] ||= {})[i.dataset.slot] = i.value;
		});
		try {
			for (const [wk, days] of Object.entries(byWeek)) await api(`/parent/plan/${wk}/publish`, { body: { days } });
			toast(w.published ? 'Saved' : 'Week published', 'ok'); plan(week);
		} catch (err) { toast(err.message, 'error'); }
	});
	main.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => {
		try { await api(`/parent/plan/${week}/add`, { body: { kind: b.dataset.add, day: main.querySelector('#adday').value } }); toast('Added', 'ok'); plan(week); } catch (err) { toast(err.message, 'error'); }
	}));
	main.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', async () => {
		try { await api(`/parent/plan/${b.dataset.week || week}/${b.dataset.drop}`, { method: 'DELETE' }); toast('Removed', 'ok'); plan(week); } catch (err) { toast(err.message, 'error'); }
	}));
	main.querySelector('#unpub')?.addEventListener('click', async () => { await api(`/parent/plan/${week}`, { method: 'DELETE' }); toast('Unpublished', 'ok'); plan(week); });
}
