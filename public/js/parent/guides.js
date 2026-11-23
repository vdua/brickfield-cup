// "Guides to teach": weekly teaching guides (markdown in /guides) with a due date and a manual "taught" flag.
import { api, esc, toast } from "/js/common.js";
import { ctx } from "./state.js";
import { parseFrontmatter, renderMarkdown } from "./markdown.js";

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);
const fmtDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

// An explicit due date wins; otherwise the Saturday of that week (weeks start on Monday).
function dueOf(g) {
  if (g.due) return g.due;
  const start = ctx.OV?.tracker?.[g.week - 1]?.start;
  return start ? new Date(Date.parse(`${start}T00:00:00Z`) + 5 * 864e5).toISOString().slice(0, 10) : "";
}

function status(g, taughtAt) {
  if (taughtAt) return { cls: "good", text: `Taught ${fmtDay(taughtAt.slice(0, 10))}` };
  const left = dayDiff(g.due, istToday());
  if (left < 0) return { cls: "bad", text: `Overdue ${-left} day${left === -1 ? "" : "s"} (was ${fmtDay(g.due)})` };
  if (left === 0) return { cls: "mid", text: "Due today" };
  return { cls: "", text: `Due ${fmtDay(g.due)} (${left} day${left === 1 ? "" : "s"})` };
}

function card(g, taughtAt) {
  const st = status(g, taughtAt);
  return `<details class="guide" data-week="${g.week}" data-file="${esc(g.file)}">
    <summary><span class="gt"><b>Week ${g.week}</b> · ${esc(g.topic)}</span>
      <span class="pill ${st.cls}">${esc(st.text)}</span>
      <button class="btn sm ${taughtAt ? "light" : "green"}" type="button" data-taught="${taughtAt ? 0 : 1}">${taughtAt ? "Undo" : "Mark taught"}</button></summary>
    <div class="gbody"><p class="empty">Loading…</p></div></details>`;
}

async function loadBody(det) {
  const box = det.querySelector(".gbody");
  if (box.dataset.loaded) return;
  try {
    const r = await fetch(`/guides/${encodeURIComponent(det.dataset.file)}`, { cache: "no-cache" });
    if (!r.ok) throw new Error("Guide file not found");
    const { meta, body } = parseFrontmatter(await r.text());
    const text = body.replace(/^\s*#\s+.*\n/, ""); // the card header already shows the title
    box.innerHTML = (meta.book ? `<p class="sub">Book: ${esc(meta.book)}${meta.chapter ? `, ${esc(meta.chapter)}` : ""}</p>` : "") + renderMarkdown(text);
    box.dataset.loaded = "1";
  } catch (e) { box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}

export async function renderGuides(el) {
  if (!el) return;
  const r = await fetch("/guides/index.json", { cache: "no-cache" });
  const list = r.ok ? ((await r.json().catch(() => ({}))).guides || []).map((g) => ({ ...g, due: dueOf(g) })) : [];
  if (!list.length) { el.innerHTML = ""; return; }
  const taught = Object.fromEntries((await api("/parent/guides/status")).map((s) => [s.week, s.taught_at]));
  const todo = list.filter((g) => !taught[g.week]).sort((a, b) => a.due.localeCompare(b.due) || a.week - b.week);
  const done = list.filter((g) => taught[g.week]).sort((a, b) => b.week - a.week);
  el.innerHTML = `<section class="card"><h2>Guides to teach</h2>
    <p class="sub">Open a guide to read it. Mark it taught once you have gone through it with him.</p>
    ${todo.map((g) => card(g, null)).join("") || '<p class="empty">All caught up.</p>'}
    ${done.length ? `<details class="guide-done"><summary>Taught (${done.length})</summary>${done.map((g) => card(g, taught[g.week])).join("")}</details>` : ""}</section>`;
  el.querySelectorAll("details.guide").forEach((d) => d.addEventListener("toggle", () => d.open && loadBody(d)));
  el.querySelectorAll("button[data-taught]").forEach((b) => {
    b.onclick = async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      b.disabled = true;
      try {
        await api(`/parent/guides/${b.closest("details").dataset.week}/taught`, { body: { taught: b.dataset.taught === "1" } });
        await renderGuides(el);
      } catch (e) { toast(e.message, "bad"); b.disabled = false; }
    };
  });
}
