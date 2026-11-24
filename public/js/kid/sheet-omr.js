// Paper worksheet: an answer grid that mirrors the printed OMR sheet. Tap a bubble (tap again to clear), type written
// answers, leave a row empty to skip. Same draft and hand-in as the on-screen worksheet.
import { esc, toast } from '/js/common.js';
import { app, ctx } from './state.js';
import {
	filled, saveDraft, later, counts, clockText, confirmHandIn,
} from './sheet-core.js';

const letter = (j) => String.fromCharCode(65 + j);

function rowHtml(W, q, i) {
	const cur = String(W.answers[q.id] ?? '');
	const cells = q.options
		? q.options.map((_, j) => `<button type="button" class="obubble ${cur === String(j) ? 'on' : ''}" data-q="${q.id}" data-v="${j}" aria-pressed="${cur === String(j)}" aria-label="Question ${i + 1} option ${letter(j)}">${letter(j)}</button>`).join('')
		: `<input class="written" data-q="${q.id}" inputmode="decimal" placeholder="Answer" aria-label="Question ${i + 1} answer" value="${esc(cur)}">`;
	return `<div class="omrrow ${filled(W, q) ? 'done' : ''}" data-row="${q.id}"><span class="no">${i + 1}</span><div class="cells">${cells}</div></div>`;
}

const summary = (W) => {
	const c = counts(W);
	return `${c.answered} of ${W.qs.length} filled in`;
};

export function omr() {
	const { W } = ctx;
	W.i = -1;
	app.innerHTML = `<div class="pitch"><div class="innbar"><div><small>Match · Answer grid</small><span class="led big" id="tally">${W.qs.filter((q) => filled(W, q)).length}/${W.qs.length}</span></div>
    <span class="sheetclock" id="clock">${clockText(W)}</span>
    <a class="quit" href="${W.pdf}" target="_blank" rel="noopener">Open the PDF</a>
    <button class="quit" type="button" id="leave">Save and leave</button></div>
    <div class="qcard omr"><p class="sub">${summary(W)}. Leave a row empty to skip it.</p>
      <div class="omrgrid">${W.qs.map((q, i) => rowHtml(W, q, i)).join('')}</div>
      <div class="answer-row" style="margin-top:22px"><button class="brick green" type="button" id="hand">Hand in</button></div></div></div>`;
	const refresh = (qid) => {
		const q = W.qs.find((x) => x.id === Number(qid));
		const row = app.querySelector(`[data-row="${qid}"]`);
		row.classList.toggle('done', filled(W, q));
		app.querySelector('#tally').textContent = `${W.qs.filter((x) => filled(W, x)).length}/${W.qs.length}`;
		app.querySelector('.sub').textContent = `${summary(W)}. Leave a row empty to skip it.`;
	};
	app.querySelectorAll('.obubble').forEach((b) => b.addEventListener('click', () => {
		const { q, v } = b.dataset;
		W.answers[q] = W.answers[q] === v ? '' : v; // tapping the chosen bubble clears it
		app.querySelectorAll(`.obubble[data-q="${q}"]`).forEach((x) => {
			const on = W.answers[q] === x.dataset.v;
			x.classList.toggle('on', on); x.setAttribute('aria-pressed', on);
		});
		refresh(q); later();
	}));
	app.querySelectorAll('.written').forEach((inp) => inp.addEventListener('input', () => { W.answers[inp.dataset.q] = inp.value; refresh(inp.dataset.q); later(); }));
	app.querySelector('#hand').onclick = confirmHandIn;
	app.querySelector('#leave').onclick = async () => {
		await saveDraft(); clearInterval(W.tick); ctx.W = null;
		toast('Saved. The clock keeps running. Start the Match again to carry on.', 'ok');
		window.location.hash = 'home';
	};
}
