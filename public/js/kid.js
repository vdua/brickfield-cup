import { api, esc, toast, hydrateAssets, sfx, sound, confetti, logEvent, fmtDur, fmtWhen } from "/js/common.js";
import { stadiumSVG, coachSVG, badgeSVG } from "/js/art.js";

const app = document.getElementById("app");
const bar = document.getElementById("bar");
let S = null;      // state from /api/state
let I = null;      // current innings
let nav = 0;       // guards against a slow screen load overwriting a newer one
const KIND = {
  diagnostic: { name: "Big Toss · Diagnostic", c: "var(--red)" },
  before: { name: "Toss · Before-check", c: "var(--red)" },
  practice: { name: "Nets practice", c: "var(--blue)" },
  puzzle: { name: "Spin puzzles", c: "var(--orange)" },
  revision: { name: "Replay · fix old mistakes", c: "var(--grass)" },
  after: { name: "Final over · After-check", c: "#ae3ec9" },
  mock: { name: "Mock Test Match", c: "#14213d" },
};
const TASK_COLORS = { diagnostic: "var(--red)", before: "var(--red)", practice: "var(--blue)", puzzle: "var(--orange)", revision: "var(--grass)", after: "#7a5aa6" };
const PACE = { 1: ["Spin", "2 runs"], 2: ["Medium pace", "4 runs"], 3: ["Fast bowler", "6 runs"] };
const TIPS = [
  "Underline what the question asks for before you start. “How many MORE” is a different question from “how many”!",
  "Write the units in your answer: cm, ₹, hours. It saves silly slips.",
  "Stuck for 5 minutes? Star it, move on, come back. Even great batsmen leave some balls.",
  "Before you play the shot: is your answer sensible? Can a share be bigger than the total?",
  "For word problems, draw the bar model first. Then the numbers are easy.",
  "Check by working backwards. Put your answer back into the question.",
];

// ---------- top scoreboard ----------
function renderBar() {
  const t = S.totals;
  const initials = (S.team || "BB").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  bar.innerHTML = `
    <div class="team"><span class="crest">${esc(initials)}</span><div><b>${esc(S.team)}</b><small>Captain ${esc(S.player)}</small></div></div>
    <div class="stat"><small>Total runs</small><b class="led">${t.runs}</b></div>
    <div class="stat"><small>Runs to spend</small><b class="led">${t.wallet}</b></div>
    <div class="stat"><small>Partnership</small><b class="led">${S.streak} ${S.streak === 1 ? "day" : "days"}</b></div>
    <button class="iconbtn" id="snd" type="button" aria-pressed="${sound.on}">${sound.on ? "Sound on" : "Sound off"}</button>
    <button class="iconbtn" id="logout" type="button">Log out</button>`;
  bar.querySelector("#snd").onclick = () => { sound.on = !sound.on; renderBar(); logEvent("sound_toggle", sound.on ? "on" : "off"); };
  bar.querySelector("#logout").onclick = async () => { await api("/logout", { body: {} }).catch(() => {}); location.href = "/"; };
}

// ---------- home ----------
async function home() {
  I = null;
  const my = ++nav;
  try { S = await api("/state"); } catch (e) { app.innerHTML = `<div class="loading" style="color:var(--ink)">${esc(e.message)}</div>`; return; }
  if (my !== nav) return;
  renderBar();
  const st = S.stadium, cur = st.stages[st.stage], next = st.next;
  const fromRuns = cur.runs, toRuns = next ? next.runs : cur.runs;
  const pct = next ? Math.min(1, (S.totals.runs - fromRuns) / (toRuns - fromRuns)) : 1;
  const on = Math.round(pct * 20);
  const msg = S.message;
  const tip = TIPS[new Date().getDate() % TIPS.length];
  const goalPct = Math.min(100, Math.round((S.todayMin / Math.max(1, S.goalMin)) * 100));
  const w = S.thisWeek;

  app.innerHTML = `<main class="home">
    <section class="panel stadium">
      <div class="art" data-asset="/assets/stadium-${st.stage}.webp" aria-label="${esc(cur.name)}">${stadiumSVG(st.stage, S.totals.runs)}</div>
      <div class="info">
        <div class="title"><b>${esc(cur.name)}</b><span>${esc(cur.desc)}</span></div>
        <div class="brickbar" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</div>
        <div>${next ? `<b>${toRuns - S.totals.runs}</b> more runs to unlock: <b>${esc(next.name)}</b>` : "Your stadium is complete. Champion!"}</div>
      </div>
    </section>

    <section class="panel">
      <div class="coach">
        <div class="bot" data-asset="/assets/coach.webp" aria-label="Coach Stumpy">${coachSVG(msg && !msg.seen_at ? "wow" : "happy")}</div>
        <div class="bubble">${msg ? `<div class="from">Message from Dad · ${fmtWhen(msg.created_at)}</div><div>${esc(msg.body)}</div>
          <div class="reacts">${["Thanks!", "High five", "Let's go!"].map((r) => `<button type="button" data-react="${r}" class="${msg.reaction === r ? "on" : ""}">${r}</button>`).join("")}</div>`
          : `<div class="from">Coach Stumpy's tip</div><div>${esc(tip)}</div>`}</div>
      </div>
    </section>

    <section class="panel">
      <div class="goal">
        <div class="ring" style="--p:${goalPct}"><span>${S.todayMin}m</span></div>
        <div><h2>Today's batting</h2><p class="sub" style="margin:0">${S.todayMin >= S.goalMin ? "Daily goal done! Great knock." : `${S.goalMin - S.todayMin} more minutes to reach today's ${S.goalMin}-minute goal.`}</p></div>
      </div>
    </section>

    <section class="panel span2">
      <h2>Week ${S.week}: ${esc(w.match)}</h2>
      <p class="sub">${esc(w.topic)} · ${esc(w.phase)} phase. Finish all five to win the match.</p>
      <div class="mission">${S.mission.map((m) => {
        const done = m.done >= m.need;
        return `<button class="task ${done ? "done" : ""} ${m.available ? "" : "na"}" type="button" data-kind="${m.kind}" ${m.available ? "" : "aria-disabled='true'"} style="--c:${TASK_COLORS[m.kind]}">
          ${done ? `<span class="tick" aria-label="done">✓</span>` : ""}
          <b>${esc(m.label)}</b><small>${esc(m.hint)}</small>
          ${m.best !== null && m.total ? `<small>Best: ${m.best}/${m.total}</small>` : ""}
          <span class="dots">${Array.from({ length: m.need }, (_, i) => `<i class="${i < m.done ? "on" : ""}"></i>`).join("")}</span>
        </button>`;
      }).join("")}</div>
    </section>

    <section class="panel span2">
      <h2>The road to SASMO</h2>
      <p class="sub">19 matches. Each week is a new fixture.</p>
      <div class="season" id="season">${S.roadmap.map((r) => `<div class="wk ${r.week < S.week ? "past" : r.week === S.week ? "now" : ""} ${r.week === 19 ? "final" : ""}" ${r.week === S.week ? 'id="nowwk"' : ""}>
        <span class="ph">${esc(r.phase)}</span><b>Wk ${r.week}</b>${esc(r.match)}</div>`).join("")}</div>
    </section>

    <section class="panel">
      <h2>Trophy cabinet</h2>
      <p class="sub">${S.badges.filter((b) => b.earned_at).length} of ${S.badges.length} badges won</p>
      <div class="shelf">${S.badges.map((b) => `<button type="button" class="badge ${b.earned_at ? "" : "locked"}" data-badge="${b.code}">
        <div class="ic" data-asset="/assets/badges/${b.code}.webp" aria-label="${esc(b.name)}">${badgeSVG(b, !!b.earned_at)}</div>${esc(b.name)}</button>`).join("")}</div>
    </section>

    <section class="panel">
      <h2>Reward shop</h2>
      <p class="sub">Spend runs on treats. Dad approves them.</p>
      <div class="shop">${S.rewards.filter((r) => r.status !== "approved").map((r) => {
        const can = S.totals.wallet >= r.cost;
        return `<div class="reward"><div><b>${esc(r.title)}</b><small>${r.cost} runs</small>
          ${r.status === "available" ? `<div class="meter"><i style="width:${Math.min(100, (S.totals.wallet / r.cost) * 100)}%"></i></div>` : ""}</div>
          ${r.status === "requested" ? `<span class="chip pace2">Waiting for Dad</span>` : `<button class="brick ${can ? "yellow" : "ghost"}" type="button" data-reward="${r.id}" ${can ? "" : "disabled"}>${can ? "Get it" : `${r.cost - S.totals.wallet} to go`}</button>`}</div>`;
      }).join("") || `<p class="sub">No rewards yet. Ask Dad to add some!</p>`}
      ${S.rewards.filter((r) => r.status === "approved").slice(-3).map((r) => `<div class="reward"><div><b>${esc(r.title)}</b><small>Claimed</small></div><span class="chip pace1">Enjoy!</span></div>`).join("")}</div>
    </section>

    <section class="panel span2">
      <h2>Recent innings</h2>
      <div class="innings-list">${S.recent.map((r) => `<div class="inn"><div><b>${esc(KIND[r.kind]?.name || r.kind)}</b><small> · Week ${r.week} · ${fmtWhen(r.ended_at)} · ${fmtDur(r.duration_s)}</small></div>
        <div><span class="led">${r.runs}/${r.wickets}</span> <small>${r.score}/${r.total}</small></div></div>`).join("") || `<p class="sub">No innings yet. Tap a task above to walk out to bat!</p>`}</div>
    </section>
  </main>`;

  hydrateAssets(app);
  const sea = document.getElementById("season"), nw = document.getElementById("nowwk");
  if (sea && nw) sea.scrollLeft = nw.offsetLeft - sea.offsetLeft - sea.clientWidth / 2 + nw.clientWidth / 2;
  app.querySelectorAll(".task").forEach((b) => b.addEventListener("click", () => {
    if (b.getAttribute("aria-disabled")) return toast("Dad hasn't added this week's questions yet.", "error");
    sfx("click"); location.hash = "play/" + b.dataset.kind;
  }));
  app.querySelectorAll("[data-react]").forEach((b) => b.addEventListener("click", async () => {
    await api(`/messages/${msg.id}/react`, { body: { reaction: b.dataset.react } }); sfx("badge"); toast("Sent to Dad!", "ok"); home();
  }));
  if (msg && !msg.seen_at) api(`/messages/${msg.id}/seen`, { body: {} }).catch(() => {});
  app.querySelectorAll("[data-reward]").forEach((b) => b.addEventListener("click", async () => {
    try { await api(`/rewards/${b.dataset.reward}/request`, { body: {} }); sfx("badge"); confetti(60); toast("Request sent to Dad!", "ok"); home(); }
    catch (e) { toast(e.message, "error"); }
  }));
  app.querySelectorAll("[data-badge]").forEach((b) => b.addEventListener("click", () => {
    const x = S.badges.find((y) => y.code === b.dataset.badge);
    toast(`${x.name}: ${x.desc}${x.earned_at ? " · Won!" : ""}`);
  }));
}

// ---------- innings ----------
async function play(kind) {
  const my = ++nav;
  app.innerHTML = `<div class="pitch"><div class="loading">Walking out to bat…</div></div>`;
  let d;
  try { d = await api("/session/start", { body: { kind } }); }
  catch (e) { toast(e.message, "error"); location.hash = "home"; return; }
  if (my !== nav) return;
  I = { id: d.session.id, kind, qs: d.questions, i: 0, res: [], runs: 0, wk: 0, away: 0, awayCount: 0, hiddenAt: null, t0: Date.now(), checked: false, timer: null };
  if (!S) { try { S = await api("/state"); renderBar(); } catch (e) {} }
  ball();
}

function ballsHtml() {
  return I.qs.map((q, i) => {
    const r = I.res[i];
    if (!r) return `<i class="${i === I.i ? "now" : ""}">${i + 1}</i>`;
    return r.correct ? `<i class="r${r.runs}">${r.runs}</i>` : `<i class="w">W</i>`;
  }).join("");
}

function ball() {
  const q = I.qs[I.i];
  I.t0 = Date.now(); I.checked = false;
  const pace = PACE[q.difficulty] || PACE[2];
  app.innerHTML = `<div class="pitch">
    <div class="innbar">
      <div><small>${esc(KIND[I.kind]?.name || I.kind)}</small><span class="led big">${I.runs}/${I.wk}</span></div>
      <div class="balls" aria-label="Ball by ball">${ballsHtml()}</div>
      <button class="quit" type="button" id="quit">Retire</button>
    </div>
    <form class="qcard" id="qf" autocomplete="off">
      <span class="clock" id="clock">0:00</span>
      <div class="qmeta"><span class="chip">Ball ${I.i + 1} of ${I.qs.length}</span><span class="chip">${esc(q.topic)}</span>
        <span class="chip pace${q.difficulty}">${pace[0]} · ${pace[1]}</span></div>
      <p class="qtext">${esc(q.prompt)}</p>
      ${q.options
        ? `<div class="opts" role="radiogroup">${q.options.map((o, j) => `<button type="button" class="brick ${["", "yellow", "blue", "green"][j % 4]}" data-opt="${j}" role="radio" aria-checked="false">${esc(o)}</button>`).join("")}</div>
           <div class="answer-row" style="margin-top:22px"><button class="brick green" type="submit">Play the shot</button></div>`
        : `<div class="answer-row"><label class="sr" for="ans">Your answer</label><input id="ans" inputmode="decimal" placeholder="Your answer" autofocus>
           <button class="brick green" type="submit">Play the shot</button></div>`}
      <div class="checklist"><span>Read what it asks</span><span>Units</span><span>Sense check</span></div>
    </form></div>`;
  let picked = null;
  app.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => {
    picked = b.dataset.opt; sfx("click");
    app.querySelectorAll("[data-opt]").forEach((x) => { x.classList.toggle("picked", x === b); x.setAttribute("aria-checked", x === b); });
  }));
  app.querySelector("#ans")?.focus();
  clearInterval(I.timer);
  I.timer = setInterval(() => {
    const s = Math.round((Date.now() - I.t0) / 1000), el = document.getElementById("clock");
    if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 1000);
  app.querySelector("#quit").onclick = confirmQuit;
  app.querySelector("#qf").addEventListener("submit", (e) => {
    e.preventDefault();
    const given = q.options ? picked : app.querySelector("#ans").value.trim();
    if (given === null || given === "") return toast("Pick or type an answer first!");
    const secs = (Date.now() - I.t0) / 1000;
    // careless-mistake guard: a very quick answer to a harder ball gets one gentle re-check
    if (!I.checked && q.difficulty >= 2 && secs < 12) { I.checked = true; return recheck(() => submit(q, given)); }
    submit(q, given);
  });
}

function recheck(go) {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="result"><div style="width:120px;height:130px;margin:0 auto" data-asset="/assets/coach.webp">${coachSVG("wow")}</div>
    <h2 style="margin:6px 0">Whoa, quick shot!</h2><p>Read the question one more time. Did you answer exactly what it asks?</p>
    <div class="why"><button class="brick ghost" type="button" id="re">Let me re-read</button><button class="brick green" type="button" id="go">Yes, play it!</button></div></div>`;
  document.body.appendChild(o); hydrateAssets(o);
  o.querySelector("#re").onclick = () => { o.remove(); app.querySelector("#ans")?.focus(); };
  o.querySelector("#go").onclick = () => { o.remove(); go(); };
}

async function submit(q, given) {
  clearInterval(I.timer);
  const time_ms = Date.now() - I.t0;
  app.querySelectorAll("button, input").forEach((x) => (x.disabled = true));
  let r;
  try { r = await api(`/session/${I.id}/answer`, { body: { question_id: q.id, given, time_ms } }); }
  catch (e) { toast(e.message, "error"); app.querySelectorAll("button, input").forEach((x) => (x.disabled = false)); return; }
  I.res[I.i] = r;
  if (r.correct) I.runs += r.runs; else I.wk += 1;
  const o = document.createElement("div");
  o.className = "overlay";
  const last = I.i === I.qs.length - 1;
  if (r.correct) {
    const word = r.runs >= 6 ? ["SIX!", "six"] : r.runs >= 4 ? ["FOUR!", "four"] : ["TWO RUNS!", "two"];
    sfx(r.runs >= 6 ? "six" : r.runs >= 4 ? "four" : "hit");
    if (r.runs >= 6) confetti();
    o.innerHTML = `<div class="result"><div class="ballfly"></div><div class="shout ${word[1]}">${word[0]}</div>
      <p style="margin:0">Spot on! <b>${esc(r.answer)}</b> is right.</p>
      ${r.method ? `<div class="how"><b>How:</b> ${esc(r.method)}</div>` : ""}
      <button class="brick green" type="button" id="next" style="width:100%">${last ? "End of innings" : "Next ball"}</button></div>`;
    document.body.appendChild(o);
    const nb = o.querySelector("#next"); nb.focus();
    nb.onclick = () => { o.remove(); advance(); };
  } else {
    sfx("out");
    o.innerHTML = `<div class="result"><div class="stumps"><i></i><i></i><i></i></div><div class="shout out">OUT!</div>
      <p style="margin:0">You said <b>${esc(q.options ? q.options[Number(given)] : given)}</b>. The answer is <b>${esc(r.answer)}</b>.</p>
      ${r.method ? `<div class="how"><b>How:</b> ${esc(r.method)}</div>` : ""}
      <p style="margin:10px 0 0;font-weight:800">Honest review: why did I get out?</p>
      <div class="why">
        <button class="brick yellow" type="button" data-m="careless">Silly slip</button>
        <button class="brick blue" type="button" data-m="method">Didn't know how</button>
        <button class="brick" type="button" data-m="misread">Misread the question</button>
        <button class="brick ghost" type="button" data-m="guess">I guessed</button>
      </div></div>`;
    document.body.appendChild(o);
    o.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", async () => {
      o.querySelectorAll("button").forEach((x) => (x.disabled = true));
      await api(`/attempt/${r.attempt_id}/mistake`, { body: { type: b.dataset.m } }).catch(() => {});
      o.remove(); advance();
    }));
  }
}

function advance() {
  if (I.i < I.qs.length - 1) { I.i++; ball(); } else finish(false);
}

function confirmQuit() {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="result"><h2>Retire from this innings?</h2><p>Balls you've already faced still count.</p>
    <div class="why"><button class="brick green" type="button" id="stay">Keep batting</button><button class="brick ghost" type="button" id="leave">Retire</button></div></div>`;
  document.body.appendChild(o);
  o.querySelector("#stay").onclick = () => o.remove();
  o.querySelector("#leave").onclick = () => { o.remove(); logEvent("session_quit", `after ${I.res.filter(Boolean).length} balls`, I.id); finish(true); };
}

async function finish(quit) {
  clearInterval(I.timer);
  if (I.hiddenAt) { I.away += (Date.now() - I.hiddenAt) / 1000; I.hiddenAt = null; }
  app.innerHTML = `<div class="pitch"><div class="loading">Walking back to the pavilion…</div></div>`;
  let f;
  try { f = await api(`/session/${I.id}/finish`, { body: { away_s: Math.round(I.away), away_count: I.awayCount } }); }
  catch (e) { toast(e.message, "error"); location.hash = "home"; return; }
  const s = f.session, faced = I.res.filter(Boolean).length;
  const best = Math.max(0, ...I.res.filter(Boolean).map((r) => r.runs));
  const stageUp = f.stageAfter > f.stageBefore;
  const kind = I.kind;
  I = null;
  app.innerHTML = `<div class="pitch"><div class="summary">
    <div class="board">
      <div style="color:#adb5bd;font-weight:700">${quit ? "Retired" : "Innings over"} · ${esc(KIND[kind]?.name || kind)}</div>
      <div class="led score">${s.runs}/${s.wickets}</div>
      <div class="row">
        <div><b>${s.score}/${faced || s.total}</b><small>correct</small></div>
        <div><b>${fmtDur(s.duration_s)}</b><small>time</small></div>
        <div><b>${faced ? Math.round((s.runs / faced) * 100) : 0}</b><small>strike rate</small></div>
        <div><b>${best || "-"}</b><small>best shot</small></div>
      </div>
    </div>
    ${f.newBadges.length ? `<div class="panel"><h2>New in your trophy cabinet!</h2><div class="shelf">${f.newBadges.map((b) => `<div class="badge fresh">
      <div class="ic" data-asset="/assets/badges/${b.code}.webp">${badgeSVG(b, true)}</div><b>${esc(b.name)}</b><br><small>${esc(b.desc)}</small></div>`).join("")}</div></div>` : ""}
    ${stageUp ? `<div class="panel unlock"><div class="shout">New build: ${esc(f.stages[f.stageAfter].name)}!</div>
      <div class="art" data-asset="/assets/stadium-${f.stageAfter}.webp" style="border-radius:14px;overflow:hidden">${stadiumSVG(f.stageAfter, f.totals.runs)}</div></div>` : ""}
    <div class="panel" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div><b>${s.score === s.total && s.total ? "Not out and perfect!" : s.wickets ? "Every wicket is a lesson. Your mistakes go to Replay." : "Great knock!"}</b><br>
      <span class="sub">Total runs now: ${f.totals.runs}</span></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">${["practice", "puzzle", "revision"].includes(kind) ? `<button class="brick blue" type="button" id="again">Bat again</button>` : ""}
      <button class="brick green" type="button" id="pav">Back to the pavilion</button></div>
    </div></div></div>`;
  hydrateAssets(app);
  if (f.newBadges.length || stageUp) { sfx("badge"); confetti(160); }
  app.querySelector("#pav").onclick = () => { location.hash = "home"; };
  app.querySelector("#again")?.addEventListener("click", () => play(kind));
}

// ---------- focus tracking (shown to the parent as "looked away") ----------
document.addEventListener("visibilitychange", () => {
  if (!I) return;
  if (document.hidden) { I.hiddenAt = Date.now(); logEvent("page_hidden", `ball ${I.i + 1}`, I.id); }
  else if (I.hiddenAt) {
    const secs = (Date.now() - I.hiddenAt) / 1000; I.away += secs; I.awayCount++; I.hiddenAt = null;
    I.t0 += secs * 1000; // don't count time away against the ball
    logEvent("page_visible", `away ${Math.round(secs)}s`, I.id);
  }
});

// ---------- routing ----------
function route() {
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  const [name, arg] = (location.hash.slice(1) || "home").split("/");
  if (name === "play" && arg) {
    if (I && I.kind === arg) return; // already batting
    play(arg);
  } else home();
}
addEventListener("hashchange", route);
logEvent("app_open", navigator.userAgent.includes("Mobile") ? "mobile" : "desktop");
route();
