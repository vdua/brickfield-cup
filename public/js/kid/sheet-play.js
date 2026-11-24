// Playing a worksheet on screen, exam style: any question can be opened, answers can change until hand-in,
// nothing is marked while playing. Answers are kept as a draft on the server so another device can carry on.
import { api, esc, toast } from '/js/common.js';
import { app, ctx } from './state.js';
import { ensureBar, intro } from './sheets.js';
import { omr } from './sheet-omr.js';
import {
	filled, saveDraft, later, counts, clockText, startClock, confirmHandIn,
} from './sheet-core.js';

const stateOf = (W, q, i) => {
	if (filled(W, q)) return 'answered';
	return W.seen.has(i) && i !== W.i ? 'skipped' : '';
};

function stripHtml(W) {
	const c = counts(W);
	return `<div class="innbar"><div><small>Match · Worksheet</small><span class="led big">${c.answered}/${W.qs.length}</span></div>
    <div class="balls sheetnav" aria-label="Questions">${W.qs.map((q, i) => `<button type="button" data-go="${i}" class="${stateOf(W, q, i)} ${i === W.i ? 'now' : ''}" title="Question ${i + 1}">${i + 1}</button>`).join('')}</div>
    <span class="sheetclock" id="clock">${clockText(W)}</span>
    <div class="legend"><small>${c.answered} answered · ${c.skipped} skipped · ${c.open} not seen</small></div>
    <button class="quit" type="button" id="leave">Save and leave</button></div>`;
}

function questionHtml(W) {
	const q = W.qs[W.i];
	const cur = String(W.answers[q.id] ?? '');
	const last = W.i === W.qs.length - 1;
	return `<form class="qcard" id="qf" autocomplete="off">
    <div class="qmeta"><span class="chip">Question ${W.i + 1} of ${W.qs.length}</span><span class="chip">${esc(q.topic)}</span></div>
    <p class="qtext">${esc(q.prompt)}</p>
    ${q.options
		? `<div class="opts" role="radiogroup">${q.options.map((o, j) => `<button type="button" class="brick ${['', 'yellow', 'blue', 'green'][j % 4]} ${cur === String(j) ? 'picked' : ''}" data-opt="${j}" role="radio" aria-checked="${cur === String(j)}">${esc(o)}</button>`).join('')}</div>`
		: `<div class="answer-row"><label class="sr" for="ans">Your answer</label><input id="ans" inputmode="decimal" placeholder="Your answer" value="${esc(cur)}"></div>`}
    <div class="answer-row" style="margin-top:22px">
      <button class="brick ghost" type="button" id="prev" ${W.i === 0 ? 'disabled' : ''}>Previous</button>
      ${q.options ? '<button class="brick ghost" type="button" id="clear">Clear</button>' : ''}
      ${last ? '<button class="brick green" type="button" id="hand">Hand in</button>' : '<button class="brick green" type="submit">Next</button>'}
    </div></form>`;
}

function show(i) {
	const { W } = ctx;
	W.i = i; W.seen.add(i);
	app.innerHTML = `<div class="pitch">${stripHtml(W)}${questionHtml(W)}
    <p class="sheetfoot"><button class="brick yellow" type="button" id="handall">Hand in worksheet</button></p></div>`;
	const q = W.qs[i];
	const set = (v) => { W.answers[q.id] = v; later(); };
	app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', async () => { await saveDraft(); show(Number(b.dataset.go)); }));
	app.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => { set(b.dataset.opt); show(i); }));
	app.querySelector('#clear')?.addEventListener('click', () => { set(''); show(i); });
	app.querySelector('#ans')?.addEventListener('input', (e) => { set(e.target.value); });
	app.querySelector('#prev').onclick = async () => { await saveDraft(); show(i - 1); };
	app.querySelector('#qf').addEventListener('submit', async (e) => { e.preventDefault(); await saveDraft(); show(i + 1); });
	app.querySelector('#hand')?.addEventListener('click', confirmHandIn);
	app.querySelector('#handall').onclick = confirmHandIn;
	app.querySelector('#leave').onclick = async () => { await saveDraft(); ctx.W = null; toast('Saved. Start the Match again to carry on.', 'ok'); window.location.hash = 'home'; };
}

export async function playSheet(week) {
	ctx.nav += 1;
	const my = ctx.nav;
	ctx.I = null;
	app.innerHTML = '<div class="pitch"><div class="loading">Opening the worksheet…</div></div>';
	let d;
	if (!(await intro(week))) return;
	try { d = await api('/session/start', { body: { kind: 'worksheet', slot: 'match', week } }); } catch (e) { toast(e.message, 'error'); window.location.hash = 'home'; return; }
	if (my !== ctx.nav) return;
	await ensureBar();
	ctx.W = {
		sid: d.session.id,
		wsId: d.session.worksheet_id,
		qs: d.questions,
		answers: { ...d.draft },
		seen: new Set(),
		i: 0,
		timer: null,
		dirty: false,
		mode: d.session.mode,
		pdf: `/api/worksheets/${d.session.worksheet_id}/pdf`,
	};
	startClock(ctx.W, d.session);
	if (ctx.W.mode === 'paper') omr();
	else show(Math.max(0, ctx.W.qs.findIndex((q) => !filled(ctx.W, q))));
	if (Object.keys(d.draft).length) toast('Welcome back. Your saved answers are here.', 'ok');
}
