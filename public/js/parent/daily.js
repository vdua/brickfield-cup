// Daily view: minutes, score and skips per day (GET /api/parent/daily), newest first.
import { api } from '/js/common.js';
import { main, pct, level, renderTabs } from './state.js';

const dayText = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', {
	weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
});

export async function daily() {
	renderTabs('daily');
	const days = (await api('/parent/daily?days=30')).slice().reverse();
	main.innerHTML = `<section class="card"><h2>Day by day</h2>
    <p class="sub">The last 30 days he played, India time. Time counts every sitting, on screen or paper. Skips are blank answers and questions never reached.</p>
    <div class="scroll"><table class="stackt"><thead><tr><th>Day</th><th class="num">Minutes</th><th class="num">Sessions</th><th class="num">On paper</th><th class="num">Score</th><th class="num">Skipped</th></tr></thead><tbody>
    ${days.map((d) => `<tr><td data-l="Day">${dayText(d.day)}</td><td class="num" data-l="Minutes">${d.minutes}</td>
      <td class="num" data-l="Sessions">${d.sessions}${d.unfinished ? ` <span class="pill bad">${d.unfinished} not finished</span>` : ''}</td>
      <td class="num" data-l="On paper">${d.paper_sessions || ''}</td>
      <td class="num" data-l="Score">${d.total ? `<span class="pill ${level(pct(d.correct, d.total))}">${d.correct}/${d.total}</span>` : ''}</td>
      <td class="num" data-l="Skipped">${d.skipped || ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No play yet.</td></tr>'}</tbody></table></div></section>`;
}
