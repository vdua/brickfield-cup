import { api, esc } from "/js/common.js";
import { renderGuides } from "./guides.js";
import { main, MISTAKE, MCOL, ctx, pct, score, level, renderTabs } from "./state.js";

function weekMaxCard(n) {
  if (!n) return "";
  if (!n.hasQuestions) return `<section class="card"><h2>This week's maximum</h2><p class="sub">Week ${n.week} (${esc(n.topic)}) has no questions loaded yet, so there is nothing to total. Add its questions to see the maximum runs.</p></section>`;
  return `<section class="card"><h2>This week's maximum: up to ${n.total.max} runs</h2>
    <p class="sub">Week ${n.week}, ${esc(n.topic)}. Each part runs from 0 to its maximum (every answer right, the hardest questions drawn). Missed missions stay in because he can still catch them up for runs; rest days and holidays are left out. Earned so far this week: ${n.earned} runs. Use it to set reward prices.</p>
    <table><thead><tr><th>Part</th><th class="num">Questions</th><th class="num">Runs</th></tr></thead><tbody>
    ${n.parts.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${p.n}</td><td class="num">0–${p.max}</td></tr>`).join("")}
    <tr><td>Regularity bonus (${n.bonus.days} working days)</td><td class="num"></td><td class="num">${n.bonus.banked}–${n.bonus.max}</td></tr>
    <tr><td><b>Total</b></td><td class="num"></td><td class="num"><b>0–${n.total.max}</b></td></tr></tbody></table>
    <p class="sub" style="margin-top:8px">The bonus shows what is banked so far up to what he can reach by playing every remaining working day, continuing his current streak (capped at 6 a day). Replay sessions are not counted.</p></section>`;
}

// ---------------- overview ----------------
export async function overview() {
  ctx.OV = await api("/parent/overview");
  ctx.pending = ctx.OV.pendingRewards.length;
  renderTabs("overview");
  const w = ctx.OV.week, row = ctx.OV.tracker[w - 1], s = ctx.OV.settings;
  const last7 = ctx.OV.daily.slice(-7);
  const acc7 = pct(last7.reduce((a, d) => a + d.correct, 0), last7.reduce((a, d) => a + d.balls, 0));
  const min7 = last7.reduce((a, d) => a + d.minutes, 0);
  const days7 = last7.filter((d) => d.sessions).length;
  const topics = [...ctx.OV.topics].sort((a, b) => a.accuracy - b.accuracy);
  const weakest = topics.find((t) => t.attempts >= 3);
  const totalWrong = ctx.OV.mistakes.reduce((a, m) => a + m.n, 0);
  const careless = ctx.OV.mistakes.find((m) => m.m === "careless")?.n || 0;
  const leadBits = [];
  leadBits.push(`${esc(s.player_name || "He")} played ${days7} of the last 7 days (${min7} min)`);
  if (acc7 !== null) leadBits.push(`with ${acc7}% accuracy`);
  const lead = leadBits.join(" ") + "." + (weakest ? ` Weakest topic so far: ${esc(weakest.topic)} (${weakest.accuracy}%).` : "");

  main.innerHTML = `
  <section><p class="sub" style="margin:0 0 4px;color:var(--muted)">Week ${w} of 19 · ${esc(row.topic)} · ${esc(row.phase)} phase</p><p class="lead">${lead}</p></section>
  <div id="guides"></div>
  <div class="kpis">
    <div class="kpi"><small>Total runs</small><b>${ctx.OV.totals.runs}</b><em>${ctx.OV.stage}</em></div>
    <div class="kpi"><small>Streak</small><b>${ctx.OV.streak} d</b><em>days in a row</em></div>
    <div class="kpi"><small>This week</small><b>${row.minutes} min</b><em>focused time (goal ${s.daily_goal_min}/day)</em></div>
    <div class="kpi"><small>Accuracy, 7 days</small><b>${acc7 ?? "—"}${acc7 !== null ? "%" : ""}</b><em>${last7.reduce((a, d) => a + d.balls, 0)} questions</em></div>
    <div class="kpi ${careless && totalWrong && careless / totalWrong >= 0.3 ? "alert" : ""}"><small>Silly slips</small><b>${careless}</b><em>${totalWrong ? Math.round((careless / totalWrong) * 100) : 0}% of all misses</em></div>
    <div class="kpi ${ctx.pending ? "alert" : ""}"><small>Reward requests</small><b>${ctx.pending}</b><em>${ctx.pending ? '<a href="#family">Review now</a>' : "none waiting"}</em></div>
  </div>

  ${weekMaxCard(ctx.OV.weekMax)}

  <div class="grid2">
    <section class="card">
      <h2>Weekly tracker</h2><p class="sub">Before-check → after-check shows what the week's teaching added.</p>
      <div class="scroll"><table class="stackt"><thead><tr><th>Wk</th><th>Topic</th><th class="num">Before</th><th class="num">After</th><th class="num">Gain</th><th class="num">Practice</th><th class="num">Mock</th><th class="num">Slips</th><th class="num">Min</th></tr></thead>
      <tbody>${ctx.OV.tracker.map((r) => {
        const b = r.before ? pct(r.before.score, r.before.total) : null, a = r.after ? pct(r.after.score, r.after.total) : null;
        const gain = r.before && r.after ? r.after.score - Math.round((r.before.score / r.before.total) * r.after.total) : null;
        return `<tr class="${r.week === w ? "now" : r.week > w ? "future" : ""}">
          <td data-l="Week">${r.week}</td><td data-l="Topic">${esc(r.topic)}</td>
          <td class="num" data-l="Before">${r.before ? `<span class="pill ${level(b)}">${score(r.before)}</span>` : ""}</td>
          <td class="num" data-l="After">${r.after ? `<span class="pill ${level(a)}">${score(r.after)}</span>` : ""}</td>
          <td class="num" data-l="Gain">${gain !== null ? `<span class="gain ${gain > 0 ? "up" : gain < 0 ? "down" : ""}">${gain > 0 ? "+" : ""}${gain}</span>` : ""}</td>
          <td class="num" data-l="Practice">${r.practice ? `${r.practice.pct}% <small>(${r.practice.sessions})</small>` : ""}</td>
          <td class="num" data-l="Mock">${r.mock ? score(r.mock) : ""}</td>
          <td class="num" data-l="Slips">${r.careless || ""}</td>
          <td class="num" data-l="Minutes">${r.minutes || ""}</td></tr>`;
      }).join("")}</tbody></table></div>
    </section>

    <section class="card">
      <h2>Topic mastery</h2><p class="sub">All-time accuracy, weakest first. Dots show the last 15 answers (green = right).</p>
      ${weakest ? `<div class="focus" style="margin-bottom:14px"><b>Focus next:</b> ${esc(weakest.topic)} — ${weakest.accuracy}% over ${weakest.attempts} questions${weakest.careless ? `, ${weakest.careless} silly slip${weakest.careless > 1 ? "s" : ""}` : ""}. ${weakest.accuracy < 60 ? "Re-teach with a bar model this weekend, then a Replay session." : "Add a Replay session midweek."}</div>` : ""}
      <div class="mastery">${topics.map((t) => `<div class="mrow"><span>${esc(t.topic)}</span>
        <div class="track"><div class="fill" style="width:${t.accuracy}%;background:${t.accuracy >= 80 ? "var(--green)" : t.accuracy >= 60 ? "var(--amber)" : "var(--red)"}"></div></div><b class="num" style="text-align:right">${t.accuracy}%</b>
        <div class="meta"><span>${t.attempts} Qs</span><span>avg ${t.avgSec}s</span>${t.careless ? `<span>${t.careless} slip${t.careless > 1 ? "s" : ""}</span>` : ""}<span class="strip">${t.recent.slice().reverse().map((c) => `<i class="${c ? "ok" : ""}"></i>`).join("")}</span></div></div>`).join("") || `<p class="empty">No answers yet.</p>`}</div>
    </section>
  </div>

  <div class="grid2">
    <section class="card">
      <h2>Daily practice time, last 4 weeks</h2>
      <p class="sub">Minutes on task per day. The red top of a bar is time the app was in the background during a session.</p>
      <div class="legend"><span><i style="background:var(--green)"></i>On task</span><span><i style="background:#ffa8a8"></i>Looked away</span><span><i style="background:none;border-top:2px dashed var(--ink);height:0;border-radius:0"></i>Daily goal (${s.daily_goal_min} min)</span></div>
      <div class="fig" id="daily"></div>
    </section>
    <section class="card">
      <h2>Why answers were wrong</h2><p class="sub">His own honest review after each miss (${totalWrong} misses).</p>
      <div class="stack">${ctx.OV.mistakes.map((m) => `<span title="${MISTAKE[m.m]}: ${m.n}" style="width:${(m.n / Math.max(1, totalWrong)) * 100}%;background:${MCOL[m.m]}"></span>`).join("")}</div>
      <div class="legend" style="margin-top:10px">${ctx.OV.mistakes.map((m) => `<span><i style="background:${MCOL[m.m]}"></i>${MISTAKE[m.m]} · ${m.n}</span>`).join("")}</div>
      <h2 style="margin-top:22px">Badges won</h2>
      <p class="sub">${ctx.OV.badges.length} of 13</p>
      <div>${ctx.OV.badges.map((b) => `<span class="pill" style="margin:0 6px 6px 0;background:${b.color}22;color:${b.color}">${esc(b.name)}</span>`).join("") || '<span class="sub">None yet.</span>'}</div>
    </section>
  </div>`;
  drawDaily(ctx.OV.daily, Number(s.daily_goal_min || 30));
  renderGuides(document.getElementById("guides")).catch(() => {});
}

function drawDaily(days, goal) {
  const box = document.getElementById("daily");
  if (!box) return;
  const draw = () => {
    const W = box.clientWidth, H = box.clientHeight, pad = { l: 30, r: 6, t: 10, b: 22 };
    const max = Math.max(goal * 1.2, ...days.map((d) => d.minutes + d.awayMin), 10);
    const bw = (W - pad.l - pad.r) / days.length;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    const ticks = [0, Math.round(max / 2), Math.round(max)];
    let svg = ticks.map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="#e3e7ee"/><text x="${pad.l - 6}" y="${y(t) + 4}" font-size="11" text-anchor="end" fill="#5c677d">${t}</text>`).join("");
    days.forEach((d, i) => {
      const x = pad.l + i * bw + bw * 0.15, w = bw * 0.7;
      if (d.minutes) svg += `<rect x="${x}" y="${y(d.minutes)}" width="${w}" height="${y(0) - y(d.minutes)}" rx="2" fill="#2b8a3e"><title>${d.day}: ${d.minutes} min, ${d.sessions} sessions, ${d.correct}/${d.balls} correct</title></rect>`;
      if (d.awayMin) svg += `<rect x="${x}" y="${y(d.minutes + d.awayMin)}" width="${w}" height="${y(d.minutes) - y(d.minutes + d.awayMin)}" fill="#ffa8a8"/>`;
      const dt = new Date(d.day + "T00:00:00Z");
      if (i % (W < 520 ? 7 : 3) === 0 || i === days.length - 1) svg += `<text x="${x + w / 2}" y="${H - 6}" font-size="11" text-anchor="middle" fill="#5c677d">${dt.getUTCDate()}/${dt.getUTCMonth() + 1}</text>`;
    });
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}" stroke="#14213d" stroke-dasharray="5 4"/>`;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Minutes practised per day">${svg}</svg>`;
  };
  const ro = new ResizeObserver(draw); ro.observe(box);
}
