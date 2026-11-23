import { api, esc, toast, fmtWhen } from "/js/common.js";
import { main, ctx, renderTabs } from "./state.js";

// ---------------- messages & rewards ----------------
export async function family() {
  const [msgs, rewards] = await Promise.all([api("/parent/messages"), api("/parent/rewards")]);
  ctx.pending = rewards.filter((r) => r.status === "requested").length;
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
export async function settings() {
  renderTabs("settings");
  if (!ctx.OV) ctx.OV = await api("/parent/overview");
  const s = ctx.OV.settings;
  const holidays = await api("/parent/holidays");
  main.innerHTML = `<section class="card" style="max-width:640px"><h2>Settings</h2><p class="sub">The week moves on automatically every Monday from the start date. Set an override to hold or skip a week (0 = automatic).</p>
  <form id="sf" style="display:grid;gap:12px">
    <label class="field">His name (shown in the app)<input name="player_name" value="${esc(s.player_name)}"></label>
    <label class="field">Team name<input name="team_name" value="${esc(s.team_name)}"></label>
    <label class="field">Plan start date (a Monday)<input name="start_date" type="date" value="${esc(s.start_date)}"></label>
    <label class="field">Week override (currently week ${ctx.OV.week})<input name="week_override" type="number" min="0" max="19" value="${esc(s.week_override)}"></label>
    <label class="field">Daily goal, minutes<input name="daily_goal_min" type="number" min="5" max="180" value="${esc(s.daily_goal_min)}"></label>
    <label class="field">Weekly rest day (no play, streak safe)<select name="rest_days">${[["5", "Friday"], ["6", "Saturday"], ["0", "Sunday"], ["", "None"]].map(([v, n]) => `<option value="${v}" ${String(s.rest_days ?? "5") === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <div><button class="btn green" type="submit">Save</button></div>
  </form></section>
  <section class="card" style="max-width:640px;margin-top:16px"><h2>Holidays</h2><p class="sub">He cannot play on a holiday, and it never breaks his partnership streak. Add a day before it happens, or the day after to protect a missed day.</p>
    <form id="hf" class="filters" style="display:flex;gap:8px;flex-wrap:wrap"><input name="day" type="date" required><input name="note" placeholder="Reason (optional)" maxlength="60" style="flex:1 1 160px"><button class="btn" type="submit">Add</button></form>
    <table style="margin-top:10px"><tbody>${holidays.map((h) => `<tr><td>${esc(h.day)}</td><td>${esc(h.note || "")}</td><td><button class="btn sm light" type="button" data-hd="${esc(h.day)}">Remove</button></td></tr>`).join("") || '<tr><td class="sub">No holidays set.</td></tr>'}</tbody></table>
  </section>`;
  main.querySelector("#hf").addEventListener("submit", async (e) => { e.preventDefault(); try { await api("/parent/holidays", { body: { day: e.target.day.value, note: e.target.note.value } }); toast("Holiday added", "ok"); settings(); } catch (err) { toast(err.message, "error"); } });
  main.querySelectorAll("[data-hd]").forEach((b) => b.addEventListener("click", async () => { await api(`/parent/holidays/${b.dataset.hd}`, { method: "DELETE" }); toast("Removed", "ok"); settings(); }));
  main.querySelector("#sf").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/parent/settings", { body: Object.fromEntries(new FormData(e.target)) }); ctx.OV = null; toast("Saved", "ok"); settings(); } catch (err) { toast(err.message, "error"); }
  });
}
