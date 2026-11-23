// Flexible missions and working days: node test/plan.test.mjs
import assert from "node:assert/strict";
import { makeEnv } from "./dev-server.mjs";
import { handle } from "../lib/api.js";
import { workdayRules } from "../lib/api/streak.js";

const env = makeEnv(":memory:");
const cookie = {};
async function call(who, method, path, body) {
  const r = await handle(new Request("http://localhost" + path, {
    method, headers: { "content-type": "application/json", cookie: cookie[who] || "" }, body: body ? JSON.stringify(body) : undefined,
  }), env);
  const sc = r.headers.get("set-cookie"); if (sc && who) cookie[who] = sc.split(";")[0];
  return { status: r.status, data: await r.json() };
}
const addDay = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const t0 = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); // today, IST
assert.equal((await call("kid", "POST", "/api/login", { role: "kid", pin: "1234" })).status, 200);
assert.equal((await call("parent", "POST", "/api/login", { role: "parent", pin: "9999" })).status, 200);
await call("parent", "POST", "/api/parent/settings", { rest_days: "" }); // no weekly rest day, so the result does not depend on the weekday the test runs

// flexible missions: extra Nets/Spin puzzles, removal, one Toss/Match/Super over per week, and what the kid sees across weeks
{
  const pub7 = (days) => call("parent", "POST", "/api/parent/plan/7/publish", { days });
  const missions = async () => (await call("kid", "GET", "/api/state")).data.missions.filter((m) => m.week === 7);
  assert.equal((await pub7({ nets9x: t0 })).status, 400, "unknown mission name");
  assert.equal((await pub7({ toss: addDay(t0, 6), over: addDay(t0, 5) })).status, 400, "Toss must not come after the Super over");
  assert.equal((await pub7({ nets1: t0, nets2: addDay(t0, 1), nets3: addDay(t0, 2), puzzle: addDay(t0, 3), toss: addDay(t0, 5), match: addDay(t0, 5), over: addDay(t0, 6) })).status, 200);
  assert.equal((await call("parent", "POST", "/api/parent/plan/7/add", { kind: "toss", day: t0 })).status, 400, "one Toss per week");
  const added = (await call("parent", "POST", "/api/parent/plan/7/add", { kind: "nets", day: addDay(t0, 4) })).data;
  assert.deepEqual(added.slots.filter((x) => x.base === "nets").map((x) => x.slot), ["nets1", "nets2", "nets3", "nets4"]);
  assert.ok((await call("parent", "POST", "/api/parent/plan/7/add", { kind: "puzzle", day: addDay(t0, 4) })).data.slots.some((x) => x.slot === "puzzle2"));
  assert.equal((await pub7({ nets9: t0 })).status, 400, "a new mission goes through Add");
  assert.equal((await call("parent", "DELETE", "/api/parent/plan/7/puzzle2")).status, 200);
  assert.equal((await call("parent", "DELETE", "/api/parent/plan/7/puzzle2")).status, 404);
  // the kid sees the next 7 days, locked until each day
  let m = await missions();
  assert.deepEqual(m.map((x) => x.slot), ["nets1", "nets2", "nets3", "puzzle", "nets4", "toss", "match", "over"]);
  assert.equal(m.find((x) => x.slot === "nets1").status, "open");
  assert.equal(m.find((x) => x.slot === "nets4").status, "locked");
  assert.ok(m.every((x) => x.week === 7));
  // moved beyond 7 days it is hidden; moved to yesterday it is a catch-up
  await pub7({ over: addDay(t0, 20), toss: addDay(t0, 12), match: addDay(t0, 12) });
  assert.ok(!(await missions()).some((x) => x.slot === "over"), "beyond the 7-day window");
  await pub7({ nets1: addDay(t0, -3) });
  assert.equal((await missions()).find((x) => x.slot === "nets1").status, "missed");
  assert.equal(await call("parent", "DELETE", "/api/parent/plan/7").then((r) => r.status), 200);
  assert.equal((await missions()).length, 0, "unpublished weeks show nothing");
}

// working days: only a day with a playable mission counts. Toss (before-check) has no questions in week 19, so its day does not.
{
  const far = addDay(t0, 400); // clear of every other test week
  const rules = async () => (await workdayRules(env.DB)).off;
  assert.equal((await rules())(far), "nothing scheduled", "nothing published: not a working day");
  assert.equal((await call("parent", "POST", "/api/parent/plan/19/publish", { days: { nets1: far, nets2: addDay(far, 1), nets3: addDay(far, 2), puzzle: addDay(far, 3), toss: addDay(far, 4), match: addDay(far, 5), over: addDay(far, 6) } })).status, 200);
  const off = await rules();
  assert.equal(off(far), null, "a playable mission makes it a working day");
  assert.equal(off(addDay(far, 4)), "nothing scheduled", "a slot with no questions is not playable");
  assert.equal(off(addDay(far, 9)), "nothing scheduled", "a day with no slot is off");
  assert.equal((await call("parent", "POST", "/api/parent/holidays", { day: far, note: "x" })).status, 200);
  assert.ok(String((await rules())(far)).startsWith("holiday"), "a holiday wins");
  env.DB.exec(`DELETE FROM holidays WHERE day = '${far}'; DELETE FROM week_slots WHERE week = 19`);
}

console.log("ALL PLAN TESTS PASSED");
