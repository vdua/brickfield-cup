// Worksheets: add (JSON + PDF), what the kid can see, whether it was handed in, plus edit, delete and replace-PDF.
import { api, esc, toast } from '/js/common.js';
import { main, renderTabs } from './state.js';
import { formHtml, setupForm } from './worksheet-add.js';

const MAX_PDF_BYTES = 1_300_000; // base64 must stay under the server limit (about 1.3 MB of PDF)
const dayText = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const status = (w) => {
	if (!w.done_session) return w.in_progress ? '<span class="pill mid">Started</span>' : '<span class="pill">Not started</span>';
	const tag = w.late ? ' <span class="pill bad">Late</span>' : '';
	return `<a href="#sessions/${w.done_session}"><span class="pill good">${w.score}/${w.total}</span></a>${tag}`;
};

// Mode and clock can change until it is handed in; a sitting already open follows the new settings when it is reopened.
const runsText = (w) => (w.runs_table ? ` · runs ${[1, 2, 3].map((d) => w.runs_table[d] ?? '–').join('/')}` : '');
const how = (w) => {
	if (w.done_session) return `${w.mode === 'paper' ? 'Paper' : 'On screen'}${w.time_limit_min ? ` · ${w.time_limit_min} min` : ' · no clock'}${runsText(w)}`;
	return `<form class="howf" data-how="${w.id}"><select name="mode" aria-label="Mode"><option value="screen" ${w.mode === 'paper' ? '' : 'selected'}>On screen</option><option value="paper" ${w.mode === 'paper' ? 'selected' : ''}>Paper</option></select>
      <input name="limit" type="number" min="1" max="240" placeholder="no clock" value="${w.time_limit_min || ''}" aria-label="Minutes (blank for no clock)"> <span>min</span>
      <span>runs</span>${[1, 2, 3].map((d) => `<input name="r${d}" type="number" min="1" placeholder="d${d}" value="${w.runs_table?.[d] || ''}" aria-label="Runs for difficulty ${d}" style="width:56px">`).join('')}
      <button class="btn sm light" type="submit">Save</button></form>`;
};

// Week and date can move only while nothing has been started on it (an open clock or draft must stay in its slot).
const setFor = (w) => {
	if (w.done_session || w.in_progress) return dayText(w.set_date);
	return `<form class="howf" data-when="${w.id}"><input name="week" type="number" min="0" max="19" value="${w.week}" aria-label="Week (0 for free practice)" style="width:56px">
      <input name="set_date" type="date" value="${w.set_date}" aria-label="Set for" style="width:140px"><button class="btn sm light" type="submit">Save</button></form>`;
};

function toBase64(file) {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result).split(',')[1]);
		r.onerror = () => reject(new Error('Could not read that file'));
		r.readAsDataURL(file);
	});
}

export async function worksheets() {
	renderTabs('worksheets');
	const list = await api('/worksheets');
	main.innerHTML = `${formHtml()}<section class="card"><h2>Worksheets</h2>
    <p class="sub">Add a worksheet from the skill's JSON file and its PDF. You can change the mode, clock and runs until it is handed in, move its week and date until he starts it, swap the printable PDF or remove a worksheet. Removing hides it from him; sessions already played stay in the history.</p>
    <div class="scroll"><table class="stackt"><thead><tr><th>Worksheet</th><th>Set for</th><th>How</th><th class="num">Questions</th><th>PDF</th><th>Result</th><th></th></tr></thead><tbody>
    ${list.map((w) => `<tr><td data-l="Worksheet"><b>${esc(w.title)}</b><br><small>${w.week ? `Week ${w.week}` : 'Free practice'}</small></td><td data-l="Set for">${setFor(w)}</td>
      <td data-l="How">${how(w)}</td>
      <td class="num" data-l="Questions">${w.questions}</td><td data-l="PDF">${w.has_pdf ? 'Yes' : '<span class="pill bad">None</span>'}</td><td data-l="Result">${status(w)}</td>
      <td><label class="btn sm light" style="cursor:pointer">${w.has_pdf ? 'Replace PDF' : 'Add PDF'}<input type="file" accept="application/pdf" data-pdf="${w.id}" hidden></label>
        <button class="btn sm red" type="button" data-del="${w.id}" data-title="${esc(w.title)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No worksheets yet.</td></tr>'}</tbody></table></div></section>`;
	setupForm(main, worksheets);
	main.querySelectorAll('[data-when]').forEach((f) => f.addEventListener('submit', async (e) => {
		e.preventDefault();
		try { await api(`/parent/worksheets/${f.dataset.when}`, { method: 'PUT', body: { week: Number(f.week.value), set_date: f.set_date.value } }); toast('Saved', 'ok'); worksheets(); } catch (err) { toast(err.message, 'error'); }
	}));
	main.querySelectorAll('[data-how]').forEach((f) => f.addEventListener('submit', async (e) => {
		e.preventDefault();
		const t = Object.fromEntries([1, 2, 3].filter((d) => f[`r${d}`].value !== '').map((d) => [d, Number(f[`r${d}`].value)]));
		const body = { mode: f.mode.value, time_limit_min: f.limit.value === '' ? null : Number(f.limit.value), runs_table: Object.keys(t).length ? t : null };
		try { await api(`/parent/worksheets/${f.dataset.how}`, { method: 'PUT', body }); toast('Saved', 'ok'); worksheets(); } catch (err) { toast(err.message, 'error'); }
	}));
	main.querySelectorAll('[data-pdf]').forEach((inp) => inp.addEventListener('change', async () => {
		const file = inp.files[0];
		if (!file) return;
		if (file.size > MAX_PDF_BYTES) { toast('That PDF is over 1.3 MB. Compress it or drop images.', 'error'); return; }
		try {
			await api(`/parent/worksheets/${inp.dataset.pdf}/pdf`, { body: { pdf_base64: await toBase64(file) } });
			toast('PDF replaced', 'ok'); worksheets();
		} catch (e) { toast(e.message, 'error'); }
	}));
	main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
		if (!window.confirm(`Delete "${b.dataset.title}"? He will no longer see it.`)) return;
		try { await api(`/parent/worksheets/${b.dataset.del}`, { method: 'DELETE' }); toast('Deleted', 'ok'); worksheets(); } catch (e) { toast(e.message, 'error'); }
	}));
}
