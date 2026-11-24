// "Add worksheet" form: a JSON file from the skill + an optional PDF, previewed, then two existing API calls.
import { api, esc, toast, istDate } from '/js/common.js';
import {
	parseRanges, applyRanges, problems, preview, groupText,
} from './worksheet-check.js';

const MAX_PDF_BYTES = 1_300_000; // base64 must stay under the server limit (about 1.3 MB of PDF)

const toBase64 = (file) => new Promise((resolve, reject) => {
	const r = new FileReader();
	r.onload = () => resolve(String(r.result).split(',')[1]);
	r.onerror = () => reject(new Error('Could not read that file'));
	r.readAsDataURL(file);
});

export const formHtml = () => `<details class="card" id="addws"><summary><b>Add worksheet</b></summary>
  <form class="addf" id="addf" novalidate>
    <label>JSON file (from the skill)<input type="file" name="json" accept="application/json,.json"></label>
    <label>PDF (needed for paper mode)<input type="file" name="pdf" accept="application/pdf"></label>
    <label>Title<input name="title" maxlength="120"></label>
    <label>Mode<select name="mode"><option value="screen">On screen</option><option value="paper">Paper</option></select></label>
    <label>Minutes (blank = no clock)<input name="limit" type="number" min="1" max="240"></label>
    <label>Week<input name="week" type="number" min="1" max="19" required></label>
    <label>Set for<input name="set_date" type="date"></label>
    <fieldset><legend>Runs for a correct answer (blank = default 2 / 4 / 6)</legend>
      <label>Easy d1<input name="r1" type="number" min="1"></label><label>Medium d2<input name="r2" type="number" min="1"></label><label>Hard d3<input name="r3" type="number" min="1"></label></fieldset>
    <label>Difficulty by question number<input name="ranges" placeholder="1-45=1, 46-50=3"></label>
    <div id="addprev" class="addprev" aria-live="polite"></div>
    <button class="btn" type="submit" id="addgo">Add worksheet</button>
  </form></details>`;

export function setupForm(root, onDone) {
	const f = root.querySelector('#addf');
	let questions = [];
	const table = () => {
		const t = {};
		[1, 2, 3].forEach((d) => { if (f[`r${d}`].value !== '') t[d] = Number(f[`r${d}`].value); });
		return Object.keys(t).length ? t : null;
	};
	const refresh = () => {
		const r = parseRanges(f.ranges.value);
		const list = problems(r.error ? questions : applyRanges(questions, r.ranges));
		const p = preview(r.error ? questions : applyRanges(questions, r.ranges), table());
		const errs = [...(r.error ? [r.error] : []), ...list];
		f.querySelector('#addprev').innerHTML = !questions.length ? '' : `<p><b>${p.count} questions</b> · ${p.groups.map(groupText).join(', ')} · max <b>${p.max} runs</b></p>
      ${errs.length ? `<ul class="bad">${errs.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}${errs.length > 8 ? `<li>and ${errs.length - 8} more</li>` : ''}</ul>` : ''}`;
		return errs;
	};
	f.json.addEventListener('change', async () => {
		try {
			const data = JSON.parse(await f.json.files[0].text());
			questions = Array.isArray(data.questions) ? data.questions : [];
			const w = data.worksheet || {};
			f.title.value = w.title || '';
			f.mode.value = w.mode === 'paper' ? 'paper' : 'screen';
			f.limit.value = w.time_limit_min ?? '';
			f.week.value = w.week ?? '';
			f.set_date.value = w.set_date || istDate(new Date().toISOString()).toISOString().slice(0, 10);
			[1, 2, 3].forEach((d) => { f[`r${d}`].value = w.runs_table?.[d] ?? ''; });
			refresh();
		} catch { questions = []; toast('That file is not valid JSON', 'error'); }
	});
	f.addEventListener('input', refresh);
	f.set_date.value = istDate(new Date().toISOString()).toISOString().slice(0, 10);
	f.addEventListener('submit', async (e) => {
		e.preventDefault();
		const errs = refresh();
		const pdf = f.pdf.files[0];
		if (!f.title.value.trim()) { toast('Give the worksheet a title', 'error'); return; }
		if (!(Number(f.week.value) >= 1 && Number(f.week.value) <= 19)) { toast('Pick the week, 1 to 19', 'error'); return; }
		if (errs.length || !questions.length) { toast(questions.length ? 'Fix the problems listed first' : 'Pick the JSON file first', 'error'); return; }
		if (f.mode.value === 'paper' && !pdf) { toast('Paper mode needs the PDF', 'error'); return; }
		if (pdf && pdf.size > MAX_PDF_BYTES) { toast('That PDF is over 1.3 MB. Compress it or drop images.', 'error'); return; }
		const ranged = applyRanges(questions, parseRanges(f.ranges.value).ranges);
		f.addgo.disabled = true;
		let id = null;
		try {
			id = (await api('/parent/worksheets', {
				body: {
					title: f.title.value.trim(),
					mode: f.mode.value,
					time_limit_min: f.limit.value === '' ? null : Number(f.limit.value),
					week: Number(f.week.value),
					set_date: f.set_date.value,
					runs_table: table(),
					pdf_base64: pdf ? await toBase64(pdf) : undefined,
				},
			})).id;
			await api('/parent/questions/import', { body: { worksheet_id: id, questions: ranged } });
			toast('Worksheet added', 'ok');
			onDone();
		} catch (err) {
			if (id) await api(`/parent/worksheets/${id}`, { method: 'DELETE' }).catch(() => {}); // not atomic: take the empty worksheet back
			toast(err.message, 'error');
			f.addgo.disabled = false;
		}
	});
}
