// After hand-in: what was right, wrong or skipped, with the worked method, plus runs, badges and a stadium upgrade.
import { esc, hydrateAssets, sfx, confetti } from '/js/common.js';
import { stadiumSVG, badgeSVG } from '/js/art.js';
import { app } from './state.js';

const shown = (q, v) => (q.options ? q.options[Number(v)] ?? v : v);
const verdict = (r) => {
	if (r.skipped) return ['Skipped', 'skip'];
	return r.correct ? ['Correct', 'ok'] : ['Wrong', 'bad'];
};

function rowHtml(r, qs) {
	const q = qs.find((x) => x.id === r.question_id);
	const [word, cls] = verdict(r);
	const mine = r.skipped ? '' : `<small>You wrote: <b>${esc(shown(q, r.given))}</b></small>`;
	const right = r.correct ? '' : `<small>Answer: <b>${esc(r.answer)}</b></small>`;
	return `<div class="rev ${cls}"><div><b>${qs.indexOf(q) + 1}. ${esc(q.prompt)}</b>${mine}${right}
    ${r.method && !r.correct ? `<div class="how"><b>How:</b> ${esc(r.method)}</div>` : ''}</div><span class="chip">${word}</span></div>`;
}

export function sheetReview(f, qs) {
	const stageUp = f.stageAfter > f.stageBefore;
	const wrong = f.total - f.score - f.skipped;
	app.innerHTML = `<div class="pitch"><div class="summary">
    <div class="board">
      <div style="color:#adb5bd;font-weight:700">Worksheet handed in${f.late ? ' late' : ''}</div>
      <div class="led score">${f.runs}</div><small style="color:#adb5bd">runs</small>
      <div class="row">
        <div><b>${f.score}</b><small>correct</small></div>
        <div><b>${wrong}</b><small>wrong</small></div>
        <div><b>${f.skipped}</b><small>skipped</small></div>
      </div>
    </div>
    ${f.late ? `<div class="panel"><h2>Handed in after time</h2><p class="sub" style="margin:0">No runs and no streak day for this one, as the time limit (${f.time_limit_min} min) had passed. Your answers are marked below so you can learn from them.</p></div>` : ''}
    ${f.newBadges.length ? `<div class="panel"><h2>New in your trophy cabinet!</h2><div class="shelf">${f.newBadges.map((b) => `<div class="badge fresh">
      <div class="ic" data-asset="/assets/badges/${b.code}.webp">${badgeSVG(b, true)}</div><b>${esc(b.name)}</b><br><small>${esc(b.desc)}</small></div>`).join('')}</div></div>` : ''}
    ${stageUp ? `<div class="panel unlock"><div class="shout">New build: ${esc(f.stages[f.stageAfter].name)}!</div>
      <div class="art" data-asset="/assets/stadium-${f.stageAfter}.webp" style="border-radius:14px;overflow:hidden">${stadiumSVG(f.stageAfter, f.totals.runs)}</div></div>` : ''}
    <div class="panel"><h2>Review</h2><p class="sub">Wrong and skipped questions come back in Replay.${f.bonus?.runs ? ` +${f.bonus.runs} regularity run${f.bonus.runs === 1 ? '' : 's'} for showing up.` : ''}</p>
      <div class="revlist">${f.review.map((r) => rowHtml(r, qs)).join('')}</div></div>
    <div class="panel"><button class="brick green" type="button" id="pav">Back to the pavilion</button></div>
  </div></div>`;
	hydrateAssets(app);
	if (f.newBadges.length || stageUp) { sfx('badge'); confetti(160); }
	app.querySelector('#pav').onclick = () => { window.location.hash = 'home'; };
}
