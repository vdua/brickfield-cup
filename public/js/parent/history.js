import { api, esc, fmtDur, fmtWhen, istDate } from "/js/common.js";
import { main, KIND, MISTAKE, pct, level, renderTabs } from "./state.js";

// ---------------- activity ----------------
const EVT = {
  login: (d) => `Logged in (${d === "parent" ? "parent" : "player"})`, login_fail: (d) => `Wrong PIN tried (${d})`, app_open: (d) => `Opened the app on ${d}`,
  session_start: (d) => `Started ${KIND[d] || d}`, session_end: (d) => `Finished — ${d} correct`, session_quit: (d) => `Retired early ${d}`,
  page_hidden: (d) => `Switched away from the app (${d})`, page_visible: (d) => `Came back — ${d}`, sound_toggle: (d) => `Sound ${d}`, reaction: (d) => `Reacted: ${d}`, view: (d) => d,
};
export async function activity() {
  renderTabs("activity");
  const ev = await api("/parent/events?limit=400");
  const byDay = {};
  for (const e of ev) { const d = istDate(e.created_at).toISOString().slice(0, 10); (byDay[d] ||= []).push(e); }
  main.innerHTML = `<section class="card"><h2>Everything he did</h2><p class="sub">App opens, sessions, early exits and switching away during a question. Newest first, India time.</p>
    <div class="timeline">${Object.entries(byDay).map(([d, list]) => `<div class="tl-day">${fmtWhen(list[0].created_at).split(",")[0]}</div>${list.map((e) => `<div class="tl"><time>${istDate(e.created_at).toISOString().slice(11, 16)}</time>
      <span>${esc((EVT[e.type] || ((x) => `${e.type} ${x}`))(e.detail || ""))}${e.session_id ? ` · <a href="#sessions/${e.session_id}">session ${e.session_id}</a>` : ""}</span></div>`).join("")}`).join("") || `<p class="empty">Nothing yet.</p>`}</div></section>`;
}

// ---------------- sessions ----------------
export async function sessions(id) {
  renderTabs("sessions");
  if (id) return sessionDetail(id);
  const list = await api("/parent/sessions?limit=200");
  main.innerHTML = `<section class="card"><h2>All sessions</h2><p class="sub">Tap a row to see every question, his answer and how long it took.</p>
  <div class="scroll"><table class="stackt"><thead><tr><th>When</th><th>Type</th><th class="num">Week</th><th class="num">Score</th><th class="num">Runs/W</th><th class="num">Time</th><th class="num">Away</th></tr></thead><tbody>
  ${list.map((s) => `<tr style="cursor:pointer" data-id="${s.id}"><td data-l="When">${fmtWhen(s.started_at)}${s.ended_at ? "" : ' <span class="pill bad">not finished</span>'}</td><td data-l="Type">${KIND[s.kind] || s.kind}</td><td class="num" data-l="Week">${s.week}</td>
    <td class="num" data-l="Score"><span class="pill ${level(pct(s.score, s.total))}">${s.score}/${s.total}</span></td><td class="num" data-l="Runs">${s.runs}/${s.wickets}</td><td class="num" data-l="Time">${s.ended_at ? fmtDur(s.duration_s) : ""}</td>
    <td class="num" data-l="Away">${s.away_count ? `${s.away_count}× · ${fmtDur(s.away_s)}` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">No sessions yet.</td></tr>`}</tbody></table></div></section>`;
  main.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => { location.hash = "sessions/" + tr.dataset.id; }));
}
async function sessionDetail(id) {
  const d = await api(`/parent/sessions/${id}`);
  const s = d.session;
  main.innerHTML = `<p><a href="#sessions">← All sessions</a></p>
  <section class="card"><h2>${KIND[s.kind] || s.kind} · Week ${s.week}</h2>
  <p class="sub">${fmtWhen(s.started_at)} · ${s.ended_at ? fmtDur(s.duration_s) : "not finished"} · ${s.score}/${s.total} correct · ${s.runs} runs${s.away_count ? ` · switched away ${s.away_count}× (${fmtDur(s.away_s)})` : ""}</p>
  <div class="scroll"><table class="stackt"><thead><tr><th>#</th><th>Question</th><th>His answer</th><th>Correct</th><th class="num">Time</th><th>Why missed</th></tr></thead><tbody>
  ${d.attempts.map((a, i) => `<tr><td data-l="#">${i + 1}</td><td data-l="Question">${esc(a.prompt)}<br><small style="color:var(--muted)">${esc(a.topic)} · difficulty ${a.difficulty}</small></td>
    <td data-l="His answer"><span class="pill ${a.correct ? "good" : "bad"}">${esc(a.options ? JSON.parse(a.options)[Number(a.given)] ?? a.given : a.given)}</span></td><td data-l="Correct">${esc(a.answer)}</td>
    <td class="num" data-l="Time">${fmtDur(a.time_ms / 1000)}</td><td data-l="Why">${a.correct ? "" : `<span class="pill ${a.mistake || "untagged"}">${MISTAKE[a.mistake || "untagged"]}</span>`}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">No answers in this session.</td></tr>`}</tbody></table></div>
  ${d.events.length ? `<details style="margin-top:12px"><summary>Session events (${d.events.length})</summary>${d.events.map((e) => `<div class="tl"><time>${istDate(e.created_at).toISOString().slice(11, 19)}</time><span>${esc((EVT[e.type] || ((x) => e.type + " " + x))(e.detail || ""))}</span></div>`).join("")}</details>` : ""}
  </section>`;
}

// ---------------- error notebook ----------------
export async function errors() {
  renderTabs("errors");
  const rows = await api("/parent/errors");
  const topics = [...new Set(rows.map((r) => r.topic))].sort();
  main.innerHTML = `<section class="card"><h2>Error notebook</h2><p class="sub">Every wrong answer, with his reason. “Fixed” means he later got the same question right. Use it for weekend review.</p>
    <div class="filters">
      <select id="fm" aria-label="Reason"><option value="">All reasons</option>${Object.entries(MISTAKE).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select id="ft" aria-label="Topic"><option value="">All topics</option>${topics.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
      <select id="ff" aria-label="Status"><option value="open">Not fixed yet</option><option value="">All</option><option value="fixed">Fixed</option></select>
      <button class="btn light" type="button" onclick="window.print()">Print</button>
    </div><div id="elist"></div></section>`;
  const draw = () => {
    const m = main.querySelector("#fm").value, t = main.querySelector("#ft").value, f = main.querySelector("#ff").value;
    const list = rows.filter((r) => (!m || (r.mistake || "untagged") === m) && (!t || r.topic === t) && (!f || (f === "fixed" ? r.fixed : !r.fixed)));
    main.querySelector("#elist").innerHTML = list.map((r) => `<div class="err"><div class="q">${esc(r.prompt)}</div>
      <div class="meta"><span class="pill ${r.mistake || "untagged"}">${MISTAKE[r.mistake || "untagged"]}</span><span>${esc(r.topic)}</span><span>He said <b>${esc(r.options ? JSON.parse(r.options)[Number(r.given)] ?? r.given : r.given)}</b>, answer <b>${esc(r.answer)}</b></span>
      <span>${fmtDur(r.time_ms / 1000)}</span><span>${fmtWhen(r.created_at)}</span>${r.fixed ? '<span class="pill good">Fixed</span>' : ""}</div>
      ${r.method ? `<div style="font-size:14px">How: ${esc(r.method)}</div>` : ""}</div>`).join("") || `<p class="empty">Nothing here.</p>`;
  };
  main.querySelectorAll(".filters select").forEach((s) => s.addEventListener("change", draw));
  draw();
}
