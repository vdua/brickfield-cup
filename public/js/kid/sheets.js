// Worksheet list: newest first, with the printable PDF and where each one stands.
import { api, esc, toast } from '/js/common.js';
import { app, ctx } from './state.js';
import { renderBar } from './home.js';

// the scoreboard strip is filled by the home screen, so a direct visit has to load it
export async function ensureBar() {
	if (ctx.S) return;
	try { ctx.S = await api('/state'); renderBar(); } catch (e) { /* the bar stays empty until home loads */ }
}

// Before the clock starts: the limit, the PDF for paper, and a Start button. Returns true when the worksheet should start now.
export async function intro(week) {
	let list = [];
	try { list = await api('/worksheets'); } catch (e) { /* the start call reports the problem */ }
	const w = list.find((x) => x.week === week && !x.done_session);
	if (!w || w.in_progress || (w.mode !== 'paper' && !w.time_limit_min)) return true; // resume, or nothing to explain
	return new Promise((resolve) => {
		app.innerHTML = `<div class="pitch"><div class="qcard"><h2 style="margin-top:0">${esc(w.title)}</h2>
      <p class="qtext">${w.time_limit_min ? `You have <b>${w.time_limit_min} minutes</b>. The clock starts when you press Start and keeps running even if you close this page. Hand in after the time and you get no runs and no streak day.` : 'Take your time.'}</p>
      ${w.mode === 'paper' ? `<p>This one is on paper. ${w.has_pdf ? `<a href="/api/worksheets/${w.id}/pdf" target="_blank" rel="noopener">Open the PDF</a> and print it first, then press Start.` : 'Get the printed sheet, then press Start.'} Answer on the sheet, then fill in this page's answer grid.</p>` : '<p>You answer on screen. You can skip and come back until you hand in.</p>'}
      <div class="answer-row"><button class="brick ghost" type="button" id="no">Not yet</button><button class="brick green" type="button" id="go">Start</button></div></div></div>`;
		app.querySelector('#no').onclick = () => { window.location.hash = 'sheets'; resolve(false); };
		app.querySelector('#go').onclick = () => resolve(true);
	});
}

const dayText = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', {
	weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
});

function rowHtml(w) {
	const done = !!w.done_session;
	return `<div class="sheet ${done ? 'done' : ''}">
    <div><b>${esc(w.title)}</b>
      <small>${dayText(w.set_date)} · ${w.week ? `Week ${w.week}` : 'Free practice'} · ${w.questions} questions</small>
      ${done ? `<small>Handed in · score ${w.score}/${w.total}</small>` : ''}</div>
    <div class="acts">
      ${w.has_pdf ? `<a class="brick ghost" href="/api/worksheets/${w.id}/pdf" target="_blank" rel="noopener">PDF</a>` : ''}
      ${!done && w.week ? `<button class="brick green" type="button" data-play="${w.week}">Play on screen</button>` : ''}
      ${done ? '<span class="chip pace1">Done</span>' : ''}
    </div></div>`;
}

export async function sheets() {
	ctx.I = null; ctx.W = null;
	ctx.nav += 1;
	const my = ctx.nav;
	app.innerHTML = '<div class="loading" style="color:var(--ink)">Opening the scorebook…</div>';
	let list;
	try { list = await api('/worksheets'); } catch (e) { toast(e.message, 'error'); window.location.hash = 'home'; return; }
	if (my !== ctx.nav) return;
	await ensureBar();
	app.innerHTML = `<main class="home"><section class="panel span2">
    <h2>Worksheets</h2>
    <p class="sub">Print the PDF to do it on paper, or play it on screen. A worksheet can be handed in only once.</p>
    <div class="sheetlist">${list.map(rowHtml).join('') || '<p class="sub">No worksheets yet. Ask Dad to add one!</p>'}</div>
    <p style="margin:14px 0 0"><button class="brick ghost" type="button" id="back">Back to the pavilion</button></p>
  </section></main>`;
	app.querySelector('#back').onclick = () => { window.location.hash = 'home'; };
	app.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => {
		window.location.hash = `play/worksheet/match/${b.dataset.play}`;
	}));
}
