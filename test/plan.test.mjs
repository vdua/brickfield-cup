// Working days: node test/plan.test.mjs
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
