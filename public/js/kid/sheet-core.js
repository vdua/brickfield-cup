// Shared by the on-screen worksheet and the paper OMR grid: draft saving, counts, the clock and the hand-in.
import { api, toast } from '/js/common.js';
import { ctx } from './state.js';
import { sheetReview } from './sheet-review.js';

const SAVE_MS = 800;
export const filled = (W, q) => String(W.answers[q.id] ?? '').trim() !== '';

export async function saveDraft() {
	const { W } = ctx;
	if (!W) return;
	clearTimeout(W.timer); W.timer = null;
	try { await api(`/session/${W.sid}/draft`, { method: 'PUT', body: { answers: W.answers } }); W.dirty = false; } catch (e) { toast(`Not saved yet: ${e.message}`, 'error'); }
}
export const later = () => {
	ctx.W.dirty = true;
	clearTimeout(ctx.W.timer);
	ctx.W.timer = setTimeout(saveDraft, SAVE_MS);
};

export function counts(W) {
	const answered = W.qs.filter((q) => filled(W, q)).length;
	const skipped = W.qs.filter((q, i) => !filled(W, q) && W.seen.has(i) && i !== W.i).length;
	return { answered, skipped, open: W.qs.length - answered - skipped };
}

// ---------- clock: counted down on this device from the server's start time, no polling ----------
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export function clockText(W) {
	if (!W.deadline) return '';
	const left = Math.round((W.deadline - Date.now()) / 1000);
	return left > 0 ? mmss(left) : 'Time up';
}
export function startClock(W, s) {
	clearInterval(W.tick);
	if (!s.time_limit_min) return;
	// the server's clock decides: remaining time = start + limit - server now, measured from this moment
	W.deadline = Date.now() + (Date.parse(s.started_at) + s.time_limit_min * 60000 - Date.parse(s.now));
	W.tick = setInterval(() => {
		if (ctx.W !== W) { clearInterval(W.tick); return; }
		const el = document.getElementById('clock');
		const left = (W.deadline - Date.now()) / 1000;
		if (el) { el.textContent = clockText(W); el.classList.toggle('low', left > 0 && left <= 300); el.classList.toggle('over', left <= 0); }
		if (left <= 0 && !W.warned) {
			W.warned = true;
			toast("Time's up! You can still hand in, but it won't earn runs or count for your partnership.", 'error');
		}
	}, 1000);
}

export function confirmHandIn() {
	const { W } = ctx;
	const c = counts(W);
	const blank = W.qs.length - c.answered;
	const over = W.deadline && W.deadline < Date.now();
	const o = document.createElement('div');
	o.className = 'overlay';
	o.innerHTML = `<div class="result"><h2>Hand in the worksheet?</h2>
    <p>${c.answered} of ${W.qs.length} answered${blank ? `, ${blank} left blank (they count as skipped)` : ''}.</p>
    ${over ? '<p><b>Time is up:</b> this hand-in earns no runs and no streak day, but you still see the answers.</p>' : ''}
    <p><b>You can't change anything after this.</b> A worksheet is handed in only once.</p>
    <div class="why"><button class="brick ghost" type="button" id="back">Keep checking</button><button class="brick green" type="button" id="yes">Hand in</button></div></div>`;
	document.body.appendChild(o);
	o.querySelector('#back').onclick = () => o.remove();
	o.querySelector('#yes').onclick = async () => {
		o.querySelectorAll('button').forEach((b) => { b.disabled = true; });
		try {
			clearTimeout(W.timer);
			const r = await api(`/worksheets/${W.wsId}/submit`, { body: { session_id: W.sid, answers: W.answers } });
			o.remove();
			clearInterval(W.tick);
			ctx.W = null;
			sheetReview(r, W.qs);
		} catch (e) { toast(e.message, 'error'); o.remove(); }
	};
}
