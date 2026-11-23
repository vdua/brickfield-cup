// Weekly mission slots. The parent publishes a week once; each slot then opens on its day.
// A past slot he missed stays playable (as a late catch-up); a future slot never is.
// A day allows as many missions as the parent scheduled on it (at least one; the worksheet Match is exempt), so a week can't be binged.
import { ROADMAP } from "../content.js";
import { json, fail, all, one, run, istDay, nowIso, addDays } from "./util.js";
import { restRules } from "./streak.js";

// off = days after the week's Monday. Replay (revision) is an optional extra, not a slot.
export const PLAN = [
  { slot: "nets1", kind: "practice", label: "Nets 1", hint: "Practice · 4 balls", off: 0 },
  { slot: "nets2", kind: "practice", label: "Nets 2", hint: "Practice · 4 balls", off: 1 },
  { slot: "nets3", kind: "practice", label: "Nets 3", hint: "Practice · 4 balls", off: 2 },
  { slot: "puzzle", kind: "puzzle", label: "Spin puzzle", hint: "Brain-teasers · 6 balls", off: 3 },
  { slot: "toss", kind: "before", label: "Toss", hint: "Before-check · 6 balls", off: 5 },
  { slot: "match", kind: "worksheet", label: "Match", hint: "Worksheet", off: 5 },
  { slot: "over", kind: "after", label: "Super over", hint: "After-check · 6 balls", off: 6 },
];
export const GATED = new Set(PLAN.map((p) => p.kind));
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const startOfDayIso = (day) => new Date(`${day}T00:00:00+05:30`).toISOString();

export const defaultDays = (week) => Object.fromEntries(PLAN.map((p) => [p.slot, addDays(ROADMAP[week - 1].start, p.off)]));

async function hasContent(db, week) {
  const n = async (sql, ...b) => ((await one(db, sql, ...b))?.n || 0) > 0;
  return {
    before: await n("SELECT COUNT(*) n FROM questions WHERE active=1 AND kind='before' AND week=?", week),
    after: await n("SELECT COUNT(*) n FROM questions WHERE active=1 AND kind='after' AND week=?", week),
    worksheet: await n("SELECT COUNT(*) n FROM worksheets WHERE active=1 AND week=?", week),
  };
}

// Status of every slot of a week as seen on `today` (an IST day).
// done | skip (rest day) | na (no content yet) | unpublished | locked (future) | open (today) | missed (past, still playable)
export async function weekSlots(db, week, today) {
  const road = ROADMAP[week - 1];
  if (!road) return null;
  const rows = await all(db, "SELECT slot, day FROM week_slots WHERE week=?", week);
  const dayOf = Object.fromEntries(rows.map((r) => [r.slot, r.day]));
  const defaults = defaultDays(week);
  const finished = await all(db, "SELECT id, slot, ended_at, score, total FROM sessions WHERE week=? AND slot IS NOT NULL AND ended_at IS NOT NULL ORDER BY id", week);
  const doneBy = new Map();
  for (const s of finished) if (!doneBy.has(s.slot)) doneBy.set(s.slot, s);
  const { restReason } = await restRules(db);
  const have = await hasContent(db, week);
  const slots = PLAN.map((p) => {
    const day = dayOf[p.slot] || defaults[p.slot];
    const d = doneBy.get(p.slot);
    let status;
    if (d) status = "done";
    else if (!rows.length) status = "unpublished";
    else if (restReason(day)) status = "skip";
    else if (have[p.kind] === false) status = "na";
    else status = day > today ? "locked" : day === today ? "open" : "missed";
    return {
      slot: p.slot, kind: p.kind, label: p.label, hint: p.hint, day, status,
      late: !!d && istDay(d.ended_at) > day, score: d ? d.score : null, total: d ? d.total : null,
    };
  });
  return { week, published: rows.length > 0, slots };
}

// A week is "clean" when every slot that could be played was finished on its own day (at least one was).
export const cleanWeek = (w) => w.slots.some((s) => s.status === "done")
  && w.slots.every((s) => (s.status === "done" && !s.late) || s.status === "skip" || s.status === "na");

const WHY = {
  unpublished: "Dad hasn't published this week yet.",
  locked: "This one isn't open yet. It unlocks on its day.",
  skip: "No play on this day (rest day or holiday).",
  na: "No questions here yet. Ask Dad to add some!",
  done: "You already finished this one.",
};

// Checks a kid request to start a gated session. Returns { error, code } or { slot, week, kind, worksheetId }.
export async function slotForStart(db, body, today, curWeek) {
  const week = Number(body.week) || curWeek;
  const w = await weekSlots(db, week, today);
  const slot = w?.slots.find((s) => s.slot === body.slot);
  if (!slot) return { code: 400, error: "Pick a mission from this week's plan." };
  if (slot.status !== "open" && slot.status !== "missed") return { code: slot.status === "done" ? 409 : slot.status === "na" ? 404 : 403, error: WHY[slot.status] };
  if (slot.kind !== "worksheet") {
    // today's allowance is the number of missions the parent scheduled for today (at least 1, so a day with none can still be used for a catch-up)
    const sched = (await one(db, "SELECT COUNT(*) n FROM week_slots WHERE day=? AND slot != 'match'", today))?.n || 0;
    const claimed = await all(db, "SELECT DISTINCT week, slot FROM sessions WHERE slot IS NOT NULL AND kind != 'worksheet' AND started_at >= ?", startOfDayIso(today));
    const retry = claimed.some((c) => c.week === week && c.slot === slot.slot); // an unfinished try of the same one can be restarted
    if (!retry && claimed.length >= Math.max(1, sched)) return { code: 403, error: sched > 1 ? "That's all of today's missions. Come back tomorrow!" : "One mission a day. Come back tomorrow!" };
  }
  let worksheetId = null;
  if (slot.kind === "worksheet") worksheetId = (await one(db, "SELECT id FROM worksheets WHERE active=1 AND week=? ORDER BY id DESC LIMIT 1", week))?.id || null;
  return { slot: slot.slot, week, kind: slot.kind, worksheetId };
}

// Slot a worksheet submission may complete. Returns { error, code } or { slot } (slot is null for repeats and week-0 sheets).
export async function slotForSheet(db, w, today) {
  if (!w.week) return { slot: null };
  const s = (await weekSlots(db, w.week, today))?.slots.find((x) => x.slot === "match");
  if (!s) return { slot: null };
  if (s.status === "done") return { slot: null };
  if (s.status === "open" || s.status === "missed") return { slot: "match" };
  return { code: s.status === "locked" || s.status === "unpublished" ? 403 : 400, error: WHY[s.status] || "Not available." };
}

export async function slotParentRoutes({ db, method, body, seg }) {
  if (seg[1] !== "plan") return null;
  const week = Number(seg[2]);
  if (!Number.isInteger(week) || week < 1 || week > ROADMAP.length) return fail(400, "Pick a week from 1 to 19");
  if (method === "GET" && !seg[3]) return json(await weekSlots(db, week, istDay(nowIso())));
  if (method === "POST" && seg[3] === "publish") {
    const days = { ...defaultDays(week), ...(body.days && typeof body.days === "object" ? body.days : {}) };
    for (const p of PLAN) if (!DAY_RE.test(String(days[p.slot]))) return fail(400, `Pick a date for ${p.label}`);
    const now = nowIso();
    await db.batch(PLAN.map((p) => db.prepare("INSERT INTO week_slots(week, slot, day, published_at) VALUES (?, ?, ?, ?) ON CONFLICT(week, slot) DO UPDATE SET day=excluded.day").bind(week, p.slot, days[p.slot], now)));
    return json(await weekSlots(db, week, istDay(now)));
  }
  if (method === "DELETE" && !seg[3]) { // unpublish: the kid sees the week locked again; finished sessions keep their slot
    await run(db, "DELETE FROM week_slots WHERE week=?", week);
    return json(await weekSlots(db, week, istDay(nowIso())));
  }
  return null;
}
