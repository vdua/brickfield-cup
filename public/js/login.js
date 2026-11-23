// PIN-pad login shared by the player page (/) and the parent page (/parent-login).
// The page sets <body data-role="kid|parent">.
import { api, hydrateAssets } from '/js/common.js';
import { stadiumSVG } from '/js/art.js';

const role = document.body.dataset.role === 'parent' ? 'parent' : 'kid';
const home = (r) => (r === 'parent' ? '/parent' : '/kid');
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'Go'];
const dots = document.getElementById('dots');
const err = document.getElementById('err');
let pin = '';

document.getElementById('scene').innerHTML = stadiumSVG(6, 2026, true);
hydrateAssets();
api('/me', { noRedirect: true }).then((r) => { window.location.href = home(r.role); }).catch(() => {});

document.getElementById('pad').innerHTML = keys.map((k) => `<button class="brick ${k === 'Go' ? 'green' : 'ghost'}" type="button" data-k="${k}" aria-label="${k === '⌫' ? 'Delete' : k}">${k}</button>`).join('');

const draw = () => { dots.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join(''); };

async function go() {
	if (!pin) return;
	try {
		const r = await api('/login', { body: { role, pin }, noRedirect: true });
		window.location.href = home(r.role);
	} catch (e) { err.textContent = e.message; pin = ''; draw(); }
}

document.getElementById('pad').addEventListener('click', (e) => {
	const k = e.target.closest('button')?.dataset.k;
	if (!k) return;
	if (k === '⌫') pin = pin.slice(0, -1);
	else if (k === 'Go') { go(); return; } else if (pin.length < 8) pin += k;
	err.textContent = '';
	draw();
});
window.addEventListener('keydown', (e) => {
	if (/^\d$/.test(e.key) && pin.length < 8) { pin += e.key; draw(); } else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); } else if (e.key === 'Enter') go();
});
draw();
