import { api, esc, toast, fmtDur, fmtWhen, istDate } from "/js/common.js";

const main = document.getElementById("main");
const tabs = document.getElementById("tabs");
const TABS = [["overview", "Overview"], ["activity", "Activity"], ["sessions", "Sessions"], ["errors", "Error notebook"], ["questions", "Question bank"], ["family", "Messages & rewards"], ["settings", "Settings"]];
const KIND = { diagnostic: "Diagnostic", before: "Before-check", after: "After-check", practice: "Practice", puzzle: "Puzzles", revision: "Replay (mistakes)", mock: "Mock" };
const MISTAKE = { careless: "Silly slip", method: "Didn't know how", misread: "Misread", guess: "Guessed", untagged: "Not tagged" };
const MCOL = { careless: "#f08c00", method: "#1c7ed6", misread: "#e03131", guess: "#7048e8", untagged: "#ced4da" };
let OV = null;
let pending = 0;

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const score = (x) => (x ? `${x.score}/${x.total}` : "—");
const level = (p) => (p === null ? "" : p >= 80 ? "good" : p >= 60 ? "mid" : "bad");

function renderTabs(active) {
  tabs.innerHTML = TABS.map(([k, l]) => `<a href="#${k}" ${k === active ? 'aria-current="page"' : ""}>${l}${k === "family" && pending ? ` <span class="dot">${pending}</span>` : ""}</a>`).join("");
}

// ---------------- overview ----------------
async function overview() {
  OV = await api("/parent/overview");
  pending = OV.pendingRewards.length;
  renderTabs("overview");
  const w = OV.week, row = OV.tracker[w - 1], s = OV.settings;
  const last7 = OV.daily.slice(-7);
  const acc7 = pct(last7.reduce((a, d) => a + d.correct, 0), last7.reduce((a, d) => a + d.balls, 0));
  const min7 = last7.reduce((a, d) => a + d.minutes, 0);
  const days7 = last7.filter((d) => d.sessions).length;
  const topics = [...OV.topics].sort((a, b) => a.accuracy - b.accuracy);
  const weakest = topics.find((t) => t.attempts >= 3);
  const totalWrong = OV.mistakes.reduce((a, m) => a + m.n, 0);
  const careless = OV.mistakes.find((m) => m.m === "careless")?.n || 0;
  const leadBits = [];
  leadBits.push(`${esc(s.player_name || "He")} played ${days7} of the last 7 days (${min7} min)`);
  if (acc7 !== null) leadBits.push(`with ${acc7}% accuracy`);
  const lead = leadBits.join(" ") + "." + (weakest ? ` Weakest topic so far: ${esc(weakest.topic)} (${weakest.accuracy}%).` : "");

  main.innerHTML = `
  <section><p class="sub" style="margin:0 0 4px;color:var(--muted)">Week ${w} of 19 · ${esc(row.topic)} · ${esc(row.phase)} phase</p><p class="lead">${lead}</p></section>
  <div class="kpis">
    <div class="kpi"><small>Total runs</small><b>${OV.totals.runs}</b><em>${OV.stage}</em></div>
    <div class="kpi"><small>Streak</small><b>${OV.streak} d</b><em>days in a row</em></div>
    <div class="kpi"><small>This week</small><b>${row.minutes} min</b><em>focused time (goal ${s.daily_goal_min}/day)</em></div>
    <div class="kpi"><small>Accuracy, 7 days</small><b>${acc7 ?? "—"}${acc7 !== null ? "%" : ""}</b><em>${last7.reduce((a, d) => a + d.balls, 0)} questions</em></div>
    <div class="kpi ${careless && totalWrong && careless / totalWrong >= 0.3 ? "alert" : ""}"><small>Silly slips</small><b>${careless}</b><em>${totalWrong ? Math.round((careless / totalWrong) * 100) : 0}% of all misses</em></div>
    <div class="kpi ${pending ? "alert" : ""}"><small>Reward requests</small><b>${pending}</b><em>${pending ? '<a href="#family">Review now</a>' : "none waiting"}</em></div>
  </div>

  <div class="grid2">
    <section class="card">
      <h2>Weekly tracker</h2><p class="sub">Before-check → after-check shows what the week's teaching added.</p>
      <div class="scroll"><table class="stackt"><thead><tr><th>Wk</th><th>Topic</th><th class="num">Before</th><th class="num">After</th><th class="num">Gain</th><th class="num">Practice</th><th class="num">Mock</th><th class="num">Slips</th><th class="num">Min</th></tr></thead>
      <tbody>${OV.tracker.map((r) => {
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
      <div class="stack">${OV.mistakes.map((m) => `<span title="${MISTAKE[m.m]}: ${m.n}" style="width:${(m.n / Math.max(1, totalWrong)) * 100}%;background:${MCOL[m.m]}"></span>`).join("")}</div>
      <div class="legend" style="margin-top:10px">${OV.mistakes.map((m) => `<span><i style="background:${MCOL[m.m]}"></i>${MISTAKE[m.m]} · ${m.n}</span>`).join("")}</div>
      <h2 style="margin-top:22px">Badges won</h2>
      <p class="sub">${OV.badges.length} of 13</p>
      <div>${OV.badges.map((b) => `<span class="pill" style="margin:0 6px 6px 0;background:${b.color}22;color:${b.color}">${esc(b.name)}</span>`).join("") || '<span class="sub">None yet.</span>'}</div>
    </section>
  </div>`;
  drawDaily(OV.daily, Number(s.daily_goal_min || 30));
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

// ---------------- activity ----------------
const EVT = {
  login: (d) => `Logged in (${d === "parent" ? "parent" : "player"})`, login_fail: (d) => `Wrong PIN tried (${d})`, app_open: (d) => `Opened the app on ${d}`,
  session_start: (d) => `Started ${KIND[d] || d}`, session_end: (d) => `Finished — ${d} correct`, session_quit: (d) => `Retired early ${d}`,
  page_hidden: (d) => `Switched away from the app (${d})`, page_visible: (d) => `Came back — ${d}`, sound_toggle: (d) => `Sound ${d}`, reaction: (d) => `Reacted: ${d}`, view: (d) => d,
};
async function activity() {
  renderTabs("activity");
  const ev = await api("/parent/events?limit=400");
  const byDay = {};
  for (const e of ev) { const d = istDate(e.created_at).toISOString().slice(0, 10); (byDay[d] ||= []).push(e); }
  main.innerHTML = `<section class="card"><h2>Everything he did</h2><p class="sub">App opens, sessions, early exits and switching away during a question. Newest first, India time.</p>
    <div class="timeline">${Object.entries(byDay).map(([d, list]) => `<div class="tl-day">${fmtWhen(list[0].created_at).split(",")[0]}</div>${list.map((e) => `<div class="tl"><time>${istDate(e.created_at).toISOString().slice(11, 16)}</time>
      <span>${esc((EVT[e.type] || ((x) => `${e.type} ${x}`))(e.detail || ""))}${e.session_id ? ` · <a href="#sessions/${e.session_id}">session ${e.session_id}</a>` : ""}</span></div>`).join("")}`).join("") || `<p class="empty">Nothing yet.</p>`}</div></section>`;
}

// ---------------- sessions ----------------
async function sessions(id) {
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
async function errors() {
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

// ---------------- question bank ----------------
async function questions() {
  renderTabs("questions");
  const qs = await api("/parent/questions");
  const weeks = [...new Set(qs.map((q) => q.week))].sort((a, b) => a - b);
  main.innerHTML = `
  <section class="card"><h2 id="formTitle">Add a question</h2><p class="sub">Before/after checks need exactly the questions you want, for that week. Practice picks 6 at random. Week 0 means any week.</p>
    <form class="qform" id="qform">
      <input type="hidden" name="id">
      <label>Week<input name="week" type="number" min="0" max="19" value="${OV?.week || 1}" required></label>
      <label>Type<select name="kind">${["practice", "before", "after", "puzzle", "mock", "diagnostic"].map((k) => `<option value="${k}">${KIND[k]}</option>`).join("")}</select></label>
      <label>Topic<input name="topic" list="topiclist" required placeholder="e.g. Ratio"></label>
      <label>Difficulty<select name="difficulty"><option value="1">1 · easy (2 runs)</option><option value="2" selected>2 · medium (4 runs)</option><option value="3">3 · hard (6 runs)</option></select></label>
      <label class="wide">Question<textarea name="prompt" required></textarea></label>
      <label class="wide">Options for multiple choice, one per line (leave empty for a typed answer)<textarea name="options" style="min-height:60px"></textarea></label>
      <label>Answer<input name="answer" required placeholder="e.g. 3/8 · or option number"></label>
      <label class="wide" style="grid-column:span 3">How to solve it (shown after he answers)<input name="method"></label>
      <div class="wide row-actions"><button class="btn green" type="submit">Save question</button><button class="btn light" type="reset" id="clearf">Clear</button></div>
      <datalist id="topiclist">${[...new Set(qs.map((q) => q.topic))].map((t) => `<option>${esc(t)}</option>`).join("")}</datalist>
    </form>
    <p class="sub" style="margin-top:8px">Multiple choice: the answer is the option number, counting from 0. Typed answers accept fractions (3/8), mixed numbers (4 1/6), decimals and units.</p>
  </section>
  <section class="card"><h2>Bank (${qs.length})</h2>
    <div class="filters"><select id="fw" aria-label="Week"><option value="">All weeks</option>${weeks.map((w) => `<option value="${w}">${w ? "Week " + w : "Any week"}</option>`).join("")}</select>
    <select id="fk" aria-label="Type"><option value="">All types</option>${Object.keys(KIND).filter((k) => k !== "revision").map((k) => `<option value="${k}">${KIND[k]}</option>`).join("")}</select>
    <input id="fq" placeholder="Search" aria-label="Search"></div>
    <div class="scroll"><table class="stackt"><thead><tr><th class="num">Wk</th><th>Type</th><th>Question</th><th>Answer</th><th class="num">Right</th><th></th></tr></thead><tbody id="qbody"></tbody></table></div>
  </section>
  <section class="card"><details><summary>Bulk import (JSON)</summary>
    <p class="sub">Paste an array like <code>[{"week":7,"kind":"before","topic":"Percentage","difficulty":1,"prompt":"10% of 50?","answer":"5","method":"..."}]</code>. Short keys w/k/t/d/q/a/o/m also work. Ask Claude to write a week's set in this format.</p>
    <textarea id="imp" style="width:100%;min-height:140px"></textarea><button class="btn" type="button" id="impb">Import</button></details></section>`;
  const f = main.querySelector("#qform");
  const draw = () => {
    const w = main.querySelector("#fw").value, k = main.querySelector("#fk").value, s = main.querySelector("#fq").value.toLowerCase();
    const list = qs.filter((q) => (w === "" || String(q.week) === w) && (!k || q.kind === k) && (!s || (q.prompt + q.topic).toLowerCase().includes(s)));
    main.querySelector("#qbody").innerHTML = list.map((q) => `<tr><td class="num" data-l="Week">${q.week || "any"}</td><td data-l="Type">${KIND[q.kind]}<br><small>${esc(q.topic)} · d${q.difficulty}</small></td>
      <td data-l="Question">${esc(q.prompt)}${q.options ? `<br><small>${q.options.map((o, i) => `${i}: ${esc(o)}`).join(" · ")}</small>` : ""}</td>
      <td data-l="Answer">${esc(q.options ? q.options[Number(q.answer)] : q.answer)}</td><td class="num" data-l="Right">${q.tries ? `${q.rights || 0}/${q.tries}` : ""}</td>
      <td><div class="row-actions"><button class="btn sm light" type="button" data-edit="${q.id}">Edit</button><button class="btn sm red" type="button" data-del="${q.id}">Remove</button></div></td></tr>`).join("") || `<tr><td colspan="6" class="empty">No questions match.</td></tr>`;
    main.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const q = qs.find((x) => x.id === Number(b.dataset.edit));
      for (const k of ["id", "week", "kind", "topic", "difficulty", "prompt", "answer", "method"]) f.elements[k].value = q[k] ?? "";
      f.elements.options.value = (q.options || []).join("\n");
      main.querySelector("#formTitle").textContent = `Edit question #${q.id}`; f.scrollIntoView({ behavior: "smooth" });
    }));
    main.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Sure?"; return; }
      await api(`/parent/questions/${b.dataset.del}`, { method: "DELETE" }); toast("Removed", "ok"); questions();
    }));
  };
  ["#fw", "#fk"].forEach((s) => main.querySelector(s).addEventListener("change", draw));
  main.querySelector("#fq").addEventListener("input", draw);
  main.querySelector("#clearf").addEventListener("click", () => { f.elements.id.value = ""; main.querySelector("#formTitle").textContent = "Add a question"; });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const opts = v.options.split("\n").map((x) => x.trim()).filter(Boolean);
    const body = { ...v, options: opts.length >= 2 ? opts : null };
    try {
      if (v.id) await api(`/parent/questions/${v.id}`, { method: "PUT", body }); else await api("/parent/questions", { body });
      toast("Saved", "ok"); questions();
    } catch (err) { toast(err.message, "error"); }
  });
  main.querySelector("#impb").addEventListener("click", async () => {
    try { const arr = JSON.parse(main.querySelector("#imp").value); const r = await api("/parent/questions/import", { body: { questions: Array.isArray(arr) ? arr : arr.questions } }); toast(`Imported ${r.imported}`, "ok"); questions(); }
    catch (err) { toast(err.message.includes("JSON") ? "That isn't valid JSON" : err.message, "error"); }
  });
  draw();
}

// ---------------- messages & rewards ----------------
async function family() {
  const [msgs, rewards] = await Promise.all([api("/parent/messages"), api("/parent/rewards")]);
  pending = rewards.filter((r) => r.status === "requested").length;
  renderTabs("family");
  main.innerHTML = `<div class="grid2">
  <section class="card"><h2>Send him a message</h2><p class="sub">Coach Stumpy shows it on his home screen. You'll see when he reads it and how he reacts.</p>
    <form id="mf" class="field"><textarea name="body" maxlength="280" placeholder="Great work on fractions this week! Proud of you." required></textarea><div><button class="btn green" type="submit">Send</button></div></form>
    <div style="margin-top:10px">${msgs.map((m) => `<div class="msg">${esc(m.body)}<br><small>${fmtWhen(m.created_at)} · ${m.seen_at ? `read ${fmtWhen(m.seen_at)}` : "not read yet"}${m.reaction ? ` · reacted “${esc(m.reaction)}”` : ""}</small></div>`).join("")}</div>
  </section>
  <section class="card"><h2>Reward shop</h2><p class="sub">He spends runs on these. Approving keeps the runs spent and puts a fresh copy back in the shop; declining refunds them.</p>
    ${rewards.filter((r) => r.status === "requested").map((r) => `<div class="focus" style="margin-bottom:10px;border-left-color:var(--amber);background:#fff9db"><b>${esc(r.title)}</b> · ${r.cost} runs · asked ${fmtWhen(r.requested_at)}
      <div class="row-actions" style="margin-top:8px"><button class="btn sm green" type="button" data-st="approved" data-id="${r.id}">Approve</button><button class="btn sm light" type="button" data-st="available" data-id="${r.id}">Decline (refund)</button></div></div>`).join("")}
    <table><thead><tr><th>Reward</th><th class="num">Cost</th><th>Status</th><th></th></tr></thead><tbody>
    ${rewards.filter((r) => r.status !== "requested").map((r) => `<tr><td>${esc(r.title)}</td><td class="num">${r.cost}</td><td>${r.status === "approved" ? `<span class="pill good">Given ${fmtWhen(r.approved_at)}</span>` : '<span class="pill">In shop</span>'}</td>
      <td>${r.status === "available" ? `<button class="btn sm light" type="button" data-st="archived" data-id="${r.id}">Remove</button>` : ""}</td></tr>`).join("")}</tbody></table>
    <form id="rf" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" class="filters"><input name="title" placeholder="New reward, e.g. Movie night" required style="flex:1 1 200px"><input name="cost" type="number" min="1" placeholder="Runs" required style="width:110px"><button class="btn" type="submit">Add</button></form>
    <p class="sub" style="margin-top:8px">Guide: a typical practice session earns 15–25 runs, a diagnostic up to about 80.</p>
  </section></div>`;
  main.querySelector("#mf").addEventListener("submit", async (e) => { e.preventDefault(); try { await api("/parent/messages", { body: { body: e.target.body.value } }); toast("Sent", "ok"); family(); } catch (err) { toast(err.message, "error"); } });
  main.querySelector("#rf").addEventListener("submit", async (e) => { e.preventDefault(); try { await api("/parent/rewards", { body: { title: e.target.title.value, cost: e.target.cost.value } }); toast("Added", "ok"); family(); } catch (err) { toast(err.message, "error"); } });
  main.querySelectorAll("[data-st]").forEach((b) => b.addEventListener("click", async () => { await api(`/parent/rewards/${b.dataset.id}`, { body: { status: b.dataset.st } }); toast("Done", "ok"); family(); }));
}

// ---------------- settings ----------------
async function settings() {
  renderTabs("settings");
  if (!OV) OV = await api("/parent/overview");
  const s = OV.settings;
  main.innerHTML = `<section class="card" style="max-width:640px"><h2>Settings</h2><p class="sub">The week moves on automatically every Monday from the start date. Set an override to hold or skip a week (0 = automatic).</p>
  <form id="sf" style="display:grid;gap:12px">
    <label class="field">His name (shown in the app)<input name="player_name" value="${esc(s.player_name)}"></label>
    <label class="field">Team name<input name="team_name" value="${esc(s.team_name)}"></label>
    <label class="field">Plan start date (a Monday)<input name="start_date" type="date" value="${esc(s.start_date)}"></label>
    <label class="field">Week override (currently week ${OV.week})<input name="week_override" type="number" min="0" max="19" value="${esc(s.week_override)}"></label>
    <label class="field">Daily goal, minutes<input name="daily_goal_min" type="number" min="5" max="180" value="${esc(s.daily_goal_min)}"></label>
    <div><button class="btn green" type="submit">Save</button></div>
  </form></section>`;
  main.querySelector("#sf").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/parent/settings", { body: Object.fromEntries(new FormData(e.target)) }); OV = null; toast("Saved", "ok"); settings(); } catch (err) { toast(err.message, "error"); }
  });
}

// ---------------- routing ----------------
async function route() {
  const [name, arg] = (location.hash.slice(1) || "overview").split("/");
  main.innerHTML = `<p class="empty">Loading…</p>`;
  try {
    if (name === "activity") await activity();
    else if (name === "sessions") await sessions(arg);
    else if (name === "errors") await errors();
    else if (name === "questions") await questions();
    else if (name === "family") await family();
    else if (name === "settings") await settings();
    else await overview();
  } catch (e) { main.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}
addEventListener("hashchange", route);
document.getElementById("refresh").onclick = route;
document.getElementById("logout").onclick = async () => { await api("/logout", { body: {} }).catch(() => {}); location.href = "/"; };
api("/me").then((r) => { if (r.role !== "parent") location.href = "/kid"; else route(); });
