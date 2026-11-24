// Worksheets: what the kid can see, whether it was handed in, plus delete and replace-PDF.
import { api, esc, toast } from '/js/common.js';
import { main, renderTabs } from './state.js';

const MAX_PDF_BYTES = 1_300_000; // base64 must stay under the server limit (about 1.3 MB of PDF)
const dayText = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const status = (w) => {
	if (!w.done_session) return w.in_progress ? '<span class="pill mid">Started</span>' : '<span class="pill">Not started</span>';
	const tag = w.late ? ' <span class="pill bad">Late</span>' : '';
	return `<a href="#sessions/${w.done_session}"><span class="pill good">${w.score}/${w.total}</span></a>${tag}`;
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
	main.innerHTML = `<section class="card"><h2>Worksheets</h2>
    <p class="sub">Upload goes through the API or the skill (it sets the mode and time limit). Here you can swap the printable PDF or remove a worksheet. Removing hides it from him; sessions already played stay in the history.</p>
    <div class="scroll"><table class="stackt"><thead><tr><th>Worksheet</th><th>Set for</th><th>How</th><th class="num">Questions</th><th>PDF</th><th>Result</th><th></th></tr></thead><tbody>
    ${list.map((w) => `<tr><td data-l="Worksheet"><b>${esc(w.title)}</b><br><small>${w.week ? `Week ${w.week}` : 'Free practice'}</small></td><td data-l="Set for">${dayText(w.set_date)}</td>
      <td data-l="How">${w.mode === 'paper' ? 'Paper' : 'On screen'}${w.time_limit_min ? ` · ${w.time_limit_min} min` : ' · no clock'}</td>
      <td class="num" data-l="Questions">${w.questions}</td><td data-l="PDF">${w.has_pdf ? 'Yes' : '<span class="pill bad">None</span>'}</td><td data-l="Result">${status(w)}</td>
      <td><label class="btn sm light" style="cursor:pointer">${w.has_pdf ? 'Replace PDF' : 'Add PDF'}<input type="file" accept="application/pdf" data-pdf="${w.id}" hidden></label>
        <button class="btn sm red" type="button" data-del="${w.id}" data-title="${esc(w.title)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No worksheets yet.</td></tr>'}</tbody></table></div></section>`;
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
