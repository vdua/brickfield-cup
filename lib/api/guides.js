// Parent guides: the guide text is static markdown in public/guides/; only "taught" is stored here.
import { ROADMAP } from "../content.js";
import { json, fail, all, run, nowIso } from "./util.js";

export async function guideParentRoutes({ db, method, body, seg }) {
  if (seg[1] !== "guides") return null;
  if (seg[2] === "status" && method === "GET") {
    return json(await all(db, "SELECT week, taught_at FROM guide_status ORDER BY week"));
  }
  if (seg[3] === "taught" && method === "POST") {
    const week = Number(seg[2]);
    if (!Number.isInteger(week) || week < 1 || week > ROADMAP.length) return fail(400, "Bad week");
    if (body.taught === false) {
      await run(db, "DELETE FROM guide_status WHERE week=?", week);
      return json({ week, taught_at: null });
    }
    const taughtAt = nowIso();
    await run(db, "INSERT INTO guide_status(week, taught_at) VALUES (?, ?) ON CONFLICT(week) DO UPDATE SET taught_at=excluded.taught_at", week, taughtAt);
    return json({ week, taught_at: taughtAt });
  }
  return null;
}
