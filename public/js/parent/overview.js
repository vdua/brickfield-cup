// Overview: the page draws at once with a spinner in every tile, then each tile fills in as its own part
// (/api/parent/overview/<part>) arrives, so one slow part never holds back the rest.
import { api, esc } from '/js/common.js';
import { renderGuides } from './guides.js';
import { main, ctx, renderTabs } from './state.js';
import {
	SPIN, KPIS, kpiHtml, headHtml, weekMaxCard, trackerHtml, masteryHtml, wrongHtml, badgesHtml, dailyLegend, drawDaily,
} from './overview-tiles.js';

const kpi = (id, label) => `<div class="kpi" id="ov-k-${id}"><small>${label}</small><b>${SPIN}</b><em>&nbsp;</em></div>`;
const spinner = (id) => `<div id="ov-${id}">${SPIN}</div>`;

const SKELETON = `<div id="ov-root">
  <section id="ov-head">${SPIN}</section>
  <div id="guides"></div>
  <div class="kpis">${kpi('runs', 'Total runs')}${kpi('streak', 'Streak')}${kpi('week', 'This week')}${kpi('acc', 'Accuracy, 7 days')}${kpi('slips', 'Silly slips')}${kpi('rewards', 'Reward requests')}</div>
  <div id="ov-weekmax"><section class="card"><h2>This week's maximum</h2><p class="sub">${SPIN}</p></section></div>
  <div class="grid2">
    <section class="card"><h2>Weekly tracker</h2><p class="sub">Before-check → after-check shows what the week's teaching added.</p>${spinner('tracker')}</section>
    <section class="card"><h2>Topic mastery</h2><p class="sub">All-time accuracy, weakest first. Dots show the last 15 answers (green = right).</p>${spinner('mastery')}</section>
  </div>
  <div class="grid2">
    <section class="card"><h2>Daily practice time, last 4 weeks</h2>
      <p class="sub">Minutes on task per day. The red top of a bar is time the app was in the background during a session.</p>${spinner('daily')}</section>
    <section class="card"><h2>Why answers were wrong</h2>${spinner('wrong')}
      <h2 style="margin-top:22px">Badges won</h2>${spinner('badges')}</section>
  </div></div>`;

// the regions of the page each part fills (all of them show an error if the part fails to load)
const REGIONS = {
	core: ['head', 'k-runs', 'k-week', 'k-acc', 'k-rewards', 'tracker', 'daily'],
	streak: ['k-streak'],
	topics: ['k-slips', 'mastery', 'wrong'],
	'week-max': ['weekmax'],
	badges: ['badges'],
};

export async function overview() {
	renderTabs('overview');
	main.innerHTML = SKELETON;
	const root = document.getElementById('ov-root');
	const got = {};
	// a tab change while parts are still loading replaces the page; late parts are then dropped
	const put = (id, html) => { const el = root.isConnected && root.querySelector(`#ov-${id}`); if (el) el.innerHTML = html; return el; };
	const putKpi = (id, k) => { const el = put(`k-${id}`, kpiHtml(k)); if (el) el.className = `kpi${k.alert ? ' alert' : ''}`; };

	const paint = {
		core(core) {
			ctx.OV = core;
			ctx.pending = core.pendingRewards.length;
			renderTabs('overview');
			put('head', headHtml(core, got.topics));
			for (const k of ['runs', 'week', 'acc', 'rewards']) putKpi(k, KPIS[k](core));
			put('tracker', trackerHtml(core));
			const goal = Number(core.settings.daily_goal_min || 30);
			put('daily', `${dailyLegend(core.settings.daily_goal_min)}<div class="fig" id="ov-daily-fig"></div>`);
			const fig = root.querySelector('#ov-daily-fig');
			if (fig) drawDaily(fig, core.daily, goal);
			renderGuides(document.getElementById('guides')).catch(() => {});
		},
		streak: (d) => putKpi('streak', KPIS.streak(d)),
		topics(d) {
			putKpi('slips', KPIS.slips(d));
			put('mastery', masteryHtml(d));
			put('wrong', wrongHtml(d));
			if (got.core) put('head', headHtml(got.core, d));
		},
		'week-max': (d) => put('weekmax', weekMaxCard(d.weekMax)),
		badges: (d) => put('badges', badgesHtml(d)),
	};
	await Promise.all(Object.keys(REGIONS).map(async (part) => {
		try {
			got[part] = await api(`/parent/overview/${part}`);
			paint[part](got[part]);
		} catch (err) {
			for (const id of REGIONS[part]) put(id, `<span class="sub">Could not load: ${esc(err.message)}</span>`);
		}
	}));
}
