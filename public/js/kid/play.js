import { api, esc, toast, hydrateAssets, sfx, confetti, logEvent, fmtDur } from "/js/common.js";
import { stadiumSVG, coachSVG, badgeSVG } from "/js/art.js";
import { app, ctx, KIND, PACE } from "./state.js";
import { renderBar } from "./home.js";

// ---------- innings ----------
export async function play(kind, slot = "", week = 0) {
  const my = ++ctx.nav;
  app.innerHTML = `<div class="pitch"><div class="loading">Walking out to bat…</div></div>`;
  let d;
  try { d = await api("/session/start", { body: { kind, slot, week } }); }
  catch (e) { toast(e.message, "error"); location.hash = "home"; return; }
  if (my !== ctx.nav) return;
  ctx.I = { id: d.session.id, kind: d.session.kind, qs: d.questions, i: 0, res: [], runs: 0, wk: 0, away: 0, awayCount: 0, hiddenAt: null, t0: Date.now(), checked: false, timer: null };
  if (!ctx.S) { try { ctx.S = await api("/state"); renderBar(); } catch (e) {} }
  ball();
}

export function ballsHtml() {
  return ctx.I.qs.map((q, i) => {
    const r = ctx.I.res[i];
    if (!r) return `<i class="${i === ctx.I.i ? "now" : ""}">${i + 1}</i>`;
    return r.correct ? `<i class="r${r.runs}">${r.runs}</i>` : `<i class="w">W</i>`;
  }).join("");
}

export function ball() {
  const q = ctx.I.qs[ctx.I.i];
  ctx.I.t0 = Date.now(); ctx.I.checked = false;
  const pace = PACE[q.difficulty] || PACE[2];
  app.innerHTML = `<div class="pitch">
    <div class="innbar">
      <div><small>${esc(KIND[ctx.I.kind]?.name || ctx.I.kind)}</small><span class="led big">${ctx.I.runs}/${ctx.I.wk}</span></div>
      <div class="balls" aria-label="Ball by ball">${ballsHtml()}</div>
      <button class="quit" type="button" id="quit">Retire</button>
    </div>
    <form class="qcard" id="qf" autocomplete="off">
      <span class="clock" id="clock">0:00</span>
      <div class="qmeta"><span class="chip">Ball ${ctx.I.i + 1} of ${ctx.I.qs.length}</span><span class="chip">${esc(q.topic)}</span>
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
  clearInterval(ctx.I.timer);
  ctx.I.timer = setInterval(() => {
    const s = Math.round((Date.now() - ctx.I.t0) / 1000), el = document.getElementById("clock");
    if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 1000);
  app.querySelector("#quit").onclick = confirmQuit;
  app.querySelector("#qf").addEventListener("submit", (e) => {
    e.preventDefault();
    const given = q.options ? picked : app.querySelector("#ans").value.trim();
    if (given === null || given === "") return toast("Pick or type an answer first!");
    const secs = (Date.now() - ctx.I.t0) / 1000;
    // careless-mistake guard: a very quick answer to a harder ball gets one gentle re-check
    if (!ctx.I.checked && q.difficulty >= 2 && secs < 12) { ctx.I.checked = true; return recheck(() => submit(q, given)); }
    submit(q, given);
  });
}

export function recheck(go) {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="result"><div style="width:120px;height:130px;margin:0 auto" data-asset="/assets/coach.webp">${coachSVG("wow")}</div>
    <h2 style="margin:6px 0">Whoa, quick shot!</h2><p>Read the question one more time. Did you answer exactly what it asks?</p>
    <div class="why"><button class="brick ghost" type="button" id="re">Let me re-read</button><button class="brick green" type="button" id="go">Yes, play it!</button></div></div>`;
  document.body.appendChild(o); hydrateAssets(o);
  o.querySelector("#re").onclick = () => { o.remove(); app.querySelector("#ans")?.focus(); };
  o.querySelector("#go").onclick = () => { o.remove(); go(); };
}

export async function submit(q, given) {
  clearInterval(ctx.I.timer);
  const time_ms = Date.now() - ctx.I.t0;
  app.querySelectorAll("button, input").forEach((x) => (x.disabled = true));
  let r;
  try { r = await api(`/session/${ctx.I.id}/answer`, { body: { question_id: q.id, given, time_ms } }); }
  catch (e) { toast(e.message, "error"); app.querySelectorAll("button, input").forEach((x) => (x.disabled = false)); return; }
  ctx.I.res[ctx.I.i] = r;
  if (r.correct) ctx.I.runs += r.runs; else ctx.I.wk += 1;
  const o = document.createElement("div");
  o.className = "overlay";
  const last = ctx.I.i === ctx.I.qs.length - 1;
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

export function advance() {
  if (ctx.I.i < ctx.I.qs.length - 1) { ctx.I.i++; ball(); } else finish(false);
}

export function confirmQuit() {
  const o = document.createElement("div");
  o.className = "overlay";
  o.innerHTML = `<div class="result"><h2>Retire from this innings?</h2><p>Balls you've already faced still count.</p>
    <div class="why"><button class="brick green" type="button" id="stay">Keep batting</button><button class="brick ghost" type="button" id="leave">Retire</button></div></div>`;
  document.body.appendChild(o);
  o.querySelector("#stay").onclick = () => o.remove();
  o.querySelector("#leave").onclick = () => { o.remove(); logEvent("session_quit", `after ${ctx.I.res.filter(Boolean).length} balls`, ctx.I.id); finish(true); };
}

export async function finish(quit) {
  clearInterval(ctx.I.timer);
  if (ctx.I.hiddenAt) { ctx.I.away += (Date.now() - ctx.I.hiddenAt) / 1000; ctx.I.hiddenAt = null; }
  app.innerHTML = `<div class="pitch"><div class="loading">Walking back to the pavilion…</div></div>`;
  let f;
  try { f = await api(`/session/${ctx.I.id}/finish`, { body: { away_s: Math.round(ctx.I.away), away_count: ctx.I.awayCount } }); }
  catch (e) { toast(e.message, "error"); location.hash = "home"; return; }
  const s = f.session, faced = ctx.I.res.filter(Boolean).length;
  const best = Math.max(0, ...ctx.I.res.filter(Boolean).map((r) => r.runs));
  const stageUp = f.stageAfter > f.stageBefore;
  const kind = ctx.I.kind;
  ctx.I = null;
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
      <span class="sub">${f.bonus?.runs ? `+${f.bonus.runs} regularity run${f.bonus.runs === 1 ? "" : "s"} for showing up. ` : ""}Total runs now: ${f.totals.runs}</span></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">${kind === "revision" ? `<button class="brick blue" type="button" id="again">Bat again</button>` : ""}
      <button class="brick green" type="button" id="pav">Back to the pavilion</button></div>
    </div></div></div>`;
  hydrateAssets(app);
  if (f.newBadges.length || stageUp) { sfx("badge"); confetti(160); }
  app.querySelector("#pav").onclick = () => { location.hash = "home"; };
  app.querySelector("#again")?.addEventListener("click", () => play(kind));
}
