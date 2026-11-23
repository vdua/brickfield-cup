import { api, esc, toast } from '/js/common.js';
import { main, KIND, ctx, renderTabs } from './state.js';

// ---------------- question bank ----------------
export async function questions() {
	renderTabs('questions');
	const qs = await api('/parent/questions');
	const weeks = [...new Set(qs.map((q) => q.week))].sort((a, b) => a - b);
	main.innerHTML = `
  <section class="card"><h2 id="formTitle">Add a question</h2><p class="sub">Before/after checks need exactly the questions you want, for that week. Practice picks 6 at random. Week 0 means any week.</p>
    <form class="qform" id="qform">
      <input type="hidden" name="id">
      <label>Week<input name="week" type="number" min="0" max="19" value="${ctx.OV?.week || 1}" required></label>
      <label>Type<select name="kind">${['practice', 'before', 'after', 'puzzle', 'mock', 'diagnostic'].map((k) => `<option value="${k}">${KIND[k]}</option>`).join('')}</select></label>
      <label>Topic<input name="topic" list="topiclist" required placeholder="e.g. Ratio"></label>
      <label>Difficulty<select name="difficulty"><option value="1">1 · easy (2 runs)</option><option value="2" selected>2 · medium (4 runs)</option><option value="3">3 · hard (6 runs)</option></select></label>
      <label class="wide">Question<textarea name="prompt" required></textarea></label>
      <label class="wide">Options for multiple choice, one per line (leave empty for a typed answer)<textarea name="options" style="min-height:60px"></textarea></label>
      <label>Answer<input name="answer" required placeholder="e.g. 3/8 · or option number"></label>
      <label class="wide" style="grid-column:span 3">How to solve it (shown after he answers)<input name="method"></label>
      <div class="wide row-actions"><button class="btn green" type="submit">Save question</button><button class="btn light" type="reset" id="clearf">Clear</button></div>
      <datalist id="topiclist">${[...new Set(qs.map((q) => q.topic))].map((t) => `<option>${esc(t)}</option>`).join('')}</datalist>
    </form>
    <p class="sub" style="margin-top:8px">Multiple choice: the answer is the option number, counting from 0. Typed answers accept fractions (3/8), mixed numbers (4 1/6), decimals and units.</p>
  </section>
  <section class="card"><h2>Bank (${qs.length})</h2>
    <div class="filters"><select id="fw" aria-label="Week"><option value="">All weeks</option>${weeks.map((w) => `<option value="${w}">${w ? `Week ${w}` : 'Any week'}</option>`).join('')}</select>
    <select id="fk" aria-label="Type"><option value="">All types</option>${Object.keys(KIND).filter((k) => k !== 'revision').map((k) => `<option value="${k}">${KIND[k]}</option>`).join('')}</select>
    <input id="fq" placeholder="Search" aria-label="Search"></div>
    <div class="scroll"><table class="stackt"><thead><tr><th class="num">Wk</th><th>Type</th><th>Question</th><th>Answer</th><th class="num">Right</th><th></th></tr></thead><tbody id="qbody"></tbody></table></div>
  </section>
  <section class="card"><details><summary>Bulk import (JSON)</summary>
    <p class="sub">Paste an array like <code>[{"week":7,"kind":"before","topic":"Percentage","difficulty":1,"prompt":"10% of 50?","answer":"5","method":"..."}]</code>. Short keys w/k/t/d/q/a/o/m also work. Ask Claude to write a week's set in this format.</p>
    <textarea id="imp" style="width:100%;min-height:140px"></textarea><button class="btn" type="button" id="impb">Import</button></details></section>`;
	const f = main.querySelector('#qform');
	const draw = () => {
		const w = main.querySelector('#fw').value; const k = main.querySelector('#fk').value; const
			s = main.querySelector('#fq').value.toLowerCase();
		const list = qs.filter((q) => (w === '' || String(q.week) === w) && (!k || q.kind === k) && (!s || (q.prompt + q.topic).toLowerCase().includes(s)));
		main.querySelector('#qbody').innerHTML = list.map((q) => `<tr><td class="num" data-l="Week">${q.week || 'any'}</td><td data-l="Type">${KIND[q.kind]}<br><small>${esc(q.topic)} · d${q.difficulty}</small></td>
      <td data-l="Question">${esc(q.prompt)}${q.options ? `<br><small>${q.options.map((o, i) => `${i}: ${esc(o)}`).join(' · ')}</small>` : ''}</td>
      <td data-l="Answer">${esc(q.options ? q.options[Number(q.answer)] : q.answer)}</td><td class="num" data-l="Right">${q.tries ? `${q.rights || 0}/${q.tries}` : ''}</td>
      <td><div class="row-actions"><button class="btn sm light" type="button" data-edit="${q.id}">Edit</button><button class="btn sm red" type="button" data-del="${q.id}">Remove</button></div></td></tr>`).join('') || `<tr><td colspan="6" class="empty">No questions match.</td></tr>`;
		main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
			const q = qs.find((x) => x.id === Number(b.dataset.edit));
			for (const k of ['id', 'week', 'kind', 'topic', 'difficulty', 'prompt', 'answer', 'method']) f.elements[k].value = q[k] ?? '';
			f.elements.options.value = (q.options || []).join('\n');
			main.querySelector('#formTitle').textContent = `Edit question #${q.id}`; f.scrollIntoView({ behavior: 'smooth' });
		}));
		main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
			if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Sure?'; return; }
			await api(`/parent/questions/${b.dataset.del}`, { method: 'DELETE' }); toast('Removed', 'ok'); questions();
		}));
	};
	['#fw', '#fk'].forEach((s) => main.querySelector(s).addEventListener('change', draw));
	main.querySelector('#fq').addEventListener('input', draw);
	main.querySelector('#clearf').addEventListener('click', () => { f.elements.id.value = ''; main.querySelector('#formTitle').textContent = 'Add a question'; });
	f.addEventListener('submit', async (e) => {
		e.preventDefault();
		const v = Object.fromEntries(new FormData(f));
		const opts = v.options.split('\n').map((x) => x.trim()).filter(Boolean);
		const body = { ...v, options: opts.length >= 2 ? opts : null };
		try {
			if (v.id) await api(`/parent/questions/${v.id}`, { method: 'PUT', body }); else await api('/parent/questions', { body });
			toast('Saved', 'ok'); questions();
		} catch (err) { toast(err.message, 'error'); }
	});
	main.querySelector('#impb').addEventListener('click', async () => {
		try { const arr = JSON.parse(main.querySelector('#imp').value); const r = await api('/parent/questions/import', { body: { questions: Array.isArray(arr) ? arr : arr.questions } }); toast(`Imported ${r.imported}`, 'ok'); questions(); } catch (err) { toast(err.message.includes('JSON') ? "That isn't valid JSON" : err.message, 'error'); }
	});
	draw();
}
