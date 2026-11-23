import { api, esc, toast, hydrateAssets, sfx, sound, confetti, logEvent, fmtDur, fmtWhen } from "/js/common.js";
import { stadiumSVG, coachSVG, badgeSVG } from "/js/art.js";
import { app, bar, ctx, KIND, TASK_COLORS, TIPS } from "./state.js";

// ---------- top scoreboard ----------
export function renderBar() {
  const t = ctx.S.totals, reg = ctx.S.regularity;
  const initials = (ctx.S.team || "BB").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  bar.innerHTML = `
    <div class="team"><span class="crest">${esc(initials)}</span><div><b>${esc(ctx.S.team)}</b><small>Captain ${esc(ctx.S.player)}</small></div></div>
    <div class="stat"><small>Total runs</small><b class="led">${t.runs}</b></div>
    <div class="stat"><small>Runs to spend</small><b class="led">${t.wallet}</b></div>
    <div class="stat"><small>Partnership</small><b class="led">${ctx.S.streak} ${ctx.S.streak === 1 ? "day" : "days"}</b>
      <small>${reg.rest ? "Rest day" : reg.nextBonus ? `+${reg.nextBonus} run${reg.nextBonus === 1 ? "" : "s"} today` : "Bonus earned"} · ${reg.wicketsLeft} wkts left</small></div>
    <button class="iconbtn" id="snd" type="button" aria-pressed="${sound.on}">${sound.on ? "Sound on" : "Sound off"}</button>
    <button class="iconbtn" id="logout" type="button">Log out</button>`;
  bar.querySelector("#snd").onclick = () => { sound.on = !sound.on; renderBar(); logEvent("sound_toggle", sound.on ? "on" : "off"); };
  bar.querySelector("#logout").onclick = async () => { await api("/logout", { body: {} }).catch(() => {}); location.href = "/"; };
}

// ---------- home ----------
export async function home() {
  ctx.I = null;
  const my = ++ctx.nav;
  try { ctx.S = await api("/state"); } catch (e) { app.innerHTML = `<div class="loading" style="color:var(--ink)">${esc(e.message)}</div>`; return; }
  if (my !== ctx.nav) return;
  renderBar();
  const st = ctx.S.stadium, cur = st.stages[st.stage], next = st.next;
  const fromRuns = cur.runs, toRuns = next ? next.runs : cur.runs;
  const pct = next ? Math.min(1, (ctx.S.totals.runs - fromRuns) / (toRuns - fromRuns)) : 1;
  const on = Math.round(pct * 20);
  const msg = ctx.S.message;
  const tip = TIPS[new Date().getDate() % TIPS.length];
  const goalPct = Math.min(100, Math.round((ctx.S.todayMin / Math.max(1, ctx.S.goalMin)) * 100));
  const w = ctx.S.thisWeek;

  app.innerHTML = `<main class="home">
    ${ctx.S.regularity.rest ? `<section class="panel span2"><h2>Rest day</h2><p class="sub" style="margin:0">No innings today (${esc(ctx.S.regularity.rest)}). Your partnership is safe. Back on the next working day!</p></section>` : ""}
    <section class="panel stadium">
      <div class="art" data-asset="/assets/stadium-${st.stage}.webp" aria-label="${esc(cur.name)}">${stadiumSVG(st.stage, ctx.S.totals.runs)}</div>
      <div class="info">
        <div class="title"><b>${esc(cur.name)}</b><span>${esc(cur.desc)}</span></div>
        <div class="brickbar" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</div>
        <div>${next ? `<b>${toRuns - ctx.S.totals.runs}</b> more runs to unlock: <b>${esc(next.name)}</b>` : "Your stadium is complete. Champion!"}</div>
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
        <div class="ring" style="--p:${goalPct}"><span>${ctx.S.todayMin}m</span></div>
        <div><h2>Today's batting</h2><p class="sub" style="margin:0">${ctx.S.todayMin >= ctx.S.goalMin ? "Daily goal done! Great knock." : `${ctx.S.goalMin - ctx.S.todayMin} more minutes to reach today's ${ctx.S.goalMin}-minute goal.`}</p></div>
      </div>
    </section>

    <section class="panel span2">
      <h2>Week ${ctx.S.week}: ${esc(w.match)}</h2>
      <p class="sub">${esc(w.topic)} · ${esc(w.phase)} phase. Finish all five to win the match.</p>
      <div class="mission">${ctx.S.mission.map((m) => {
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
      <div class="season" id="season">${ctx.S.roadmap.map((r) => `<div class="wk ${r.week < ctx.S.week ? "past" : r.week === ctx.S.week ? "now" : ""} ${r.week === 19 ? "final" : ""}" ${r.week === ctx.S.week ? 'id="nowwk"' : ""}>
        <span class="ph">${esc(r.phase)}</span><b>Wk ${r.week}</b>${esc(r.match)}</div>`).join("")}</div>
    </section>

    <section class="panel">
      <h2>Trophy cabinet</h2>
      <p class="sub">${ctx.S.badges.filter((b) => b.earned_at).length} of ${ctx.S.badges.length} badges won</p>
      <div class="shelf">${ctx.S.badges.map((b) => `<button type="button" class="badge ${b.earned_at ? "" : "locked"}" data-badge="${b.code}">
        <div class="ic" data-asset="/assets/badges/${b.code}.webp" aria-label="${esc(b.name)}">${badgeSVG(b, !!b.earned_at)}</div>${esc(b.name)}</button>`).join("")}</div>
    </section>

    <section class="panel">
      <h2>Reward shop</h2>
      <p class="sub">Spend runs on treats. Dad approves them.</p>
      <div class="shop">${ctx.S.rewards.filter((r) => r.status !== "approved").map((r) => {
        const can = ctx.S.totals.wallet >= r.cost;
        return `<div class="reward"><div><b>${esc(r.title)}</b><small>${r.cost} runs</small>
          ${r.status === "available" ? `<div class="meter"><i style="width:${Math.min(100, (ctx.S.totals.wallet / r.cost) * 100)}%"></i></div>` : ""}</div>
          ${r.status === "requested" ? `<span class="chip pace2">Waiting for Dad</span>` : `<button class="brick ${can ? "yellow" : "ghost"}" type="button" data-reward="${r.id}" ${can ? "" : "disabled"}>${can ? "Get it" : `${r.cost - ctx.S.totals.wallet} to go`}</button>`}</div>`;
      }).join("") || `<p class="sub">No rewards yet. Ask Dad to add some!</p>`}
      ${ctx.S.rewards.filter((r) => r.status === "approved").slice(-3).map((r) => `<div class="reward"><div><b>${esc(r.title)}</b><small>Claimed</small></div><span class="chip pace1">Enjoy!</span></div>`).join("")}</div>
    </section>

    <section class="panel span2">
      <h2>Recent innings</h2>
      <div class="innings-list">${ctx.S.recent.map((r) => `<div class="inn"><div><b>${esc(KIND[r.kind]?.name || r.kind)}</b><small> · Week ${r.week} · ${fmtWhen(r.ended_at)} · ${fmtDur(r.duration_s)}</small></div>
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
    const x = ctx.S.badges.find((y) => y.code === b.dataset.badge);
    toast(`${x.name}: ${x.desc}${x.earned_at ? " · Won!" : ""}`);
  }));
}
