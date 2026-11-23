// End-to-end API test against the local SQLite stand-in: node test/api.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv } from "./dev-server.mjs";
import { handle, isCorrect } from "../lib/api.js";

const env = makeEnv(":memory:");
const bank = JSON.parse(readFileSync(new URL("../data/questions.json", import.meta.url)));
let cookie = { kid: "", parent: "" };
async function call(who, method, path, body) {
  const r = await handle(new Request("http://localhost" + path, {
    method, headers: { "content-type": "application/json", cookie: cookie[who] || "" }, body: body ? JSON.stringify(body) : undefined,
  }), env);
  const sc = r.headers.get("set-cookie"); if (sc && who) cookie[who] = sc.split(";")[0];
  return { status: r.status, data: await r.json() };
}

// answer checker
assert.ok(isCorrect({ answer: "25/6" }, "4 1/6"));
assert.ok(isCorrect({ answer: "3.5" }, "3.5 hours"));
assert.ok(isCorrect({ answer: "400" }, "₹400"));
assert.ok(isCorrect({ answer: "400" }, "1,300") === false);
assert.ok(isCorrect({ answer: "0.1" }, "1/10"));
assert.ok(isCorrect({ answer: "1", options: "[]" }, "1"));
assert.ok(!isCorrect({ answer: "42" }, ""));

// auth
assert.equal((await call("kid", "GET", "/api/state")).status, 401);
assert.equal((await call("x", "POST", "/api/login", { role: "kid", pin: "0000" })).status, 401);
assert.equal((await call("kid", "POST", "/api/login", { role: "kid", pin: "1234" })).status, 200);
assert.equal((await call("parent", "POST", "/api/login", { role: "parent", pin: "9999" })).status, 200);
assert.equal((await call("kid", "GET", "/api/parent/overview")).status, 403);

// state
let st = (await call("kid", "GET", "/api/state")).data;
assert.equal(st.mission.length, 5);
console.log("week", st.week, "mission", st.mission.map((m) => m.kind).join(","));

// play a diagnostic: answer correctly except 3
const start = (await call("kid", "POST", "/api/session/start", { kind: "diagnostic", week: 1 })).data;
assert.equal(start.questions.length, 20);
assert.ok(!("answer" in start.questions[0]), "answers must not leak");
const diag = bank.filter((q) => q.k === "diagnostic");
let wrongAttempt;
for (const [i, q] of start.questions.entries()) {
  const src = diag.find((d) => d.q === q.prompt);
  const given = i % 7 === 3 ? "999" : src.a;
  const r = (await call("kid", "POST", `/api/session/${start.session.id}/answer`, { question_id: q.id, given, time_ms: 30000 })).data;
  assert.equal(r.correct, given === src.a, `q${i}`);
  if (!r.correct) wrongAttempt = r.attempt_id;
}
assert.equal((await call("kid", "POST", `/api/session/${start.session.id}/answer`, { question_id: start.questions[0].id, given: "1" })).status, 409);
assert.equal((await call("kid", "POST", `/api/attempt/${wrongAttempt}/mistake`, { type: "careless" })).status, 200);
const fin = (await call("kid", "POST", `/api/session/${start.session.id}/finish`, { away_s: 12, away_count: 2 })).data;
console.log("diagnostic finished:", fin.session.score, "/", fin.session.total, "runs", fin.session.runs, "badges", fin.newBadges.map((b) => b.code));
assert.equal(fin.session.score, 17);
assert.ok(fin.newBadges.some((b) => b.code === "first_innings"));

// practice + puzzle + revision
for (const kind of ["practice", "puzzle", "revision", "before", "after"]) {
  const s = await call("kid", "POST", "/api/session/start", { kind, week: 2 });
  assert.equal(s.status, 200, kind);
  for (const q of s.data.questions) await call("kid", "POST", `/api/session/${s.data.session.id}/answer`, { question_id: q.id, given: q.options ? "0" : "1", time_ms: 9000 });
  const f = (await call("kid", "POST", `/api/session/${s.data.session.id}/finish`, {})).data;
  console.log(kind, "→", f.session.score, "/", f.session.total);
}
st = (await call("kid", "GET", "/api/state")).data;
console.log("totals", st.totals, "streak", st.streak, "stage", st.stadium.stage);

// rewards: request one we can't afford
const big = st.rewards.find((r) => r.cost > st.totals.wallet);
assert.equal((await call("kid", "POST", `/api/rewards/${big.id}/request`)).status, 400);

// parent
const ov = (await call("parent", "GET", "/api/parent/overview")).data;
assert.equal(ov.tracker.length, 19);
assert.ok(ov.tracker[0].before.total === 20);
console.log("week1 tracker", ov.tracker[0], "topics", ov.topics.length, "daily", ov.daily.slice(-1)[0]);
const errs = (await call("parent", "GET", "/api/parent/errors")).data;
assert.ok(errs.length > 0 && errs.some((e) => e.mistake === "careless"));
const sessList = (await call("parent", "GET", "/api/parent/sessions")).data;
const det = (await call("parent", "GET", `/api/parent/sessions/${sessList.at(-1).id}`)).data;
assert.equal(det.attempts.length, 20);
assert.equal((await call("parent", "POST", "/api/parent/questions", { week: 6, kind: "mock", topic: "Mixed", difficulty: 2, prompt: "2+2?", answer: "4" })).status, 200);
assert.equal((await call("parent", "POST", "/api/parent/questions", { prompt: "pick", answer: "5", options: ["a", "b"] })).status, 400);
const imp = (await call("parent", "POST", "/api/parent/questions/import", { questions: [{ w: 7, k: "before", t: "Percentage", d: 1, q: "10% of 50?", a: "5" }] })).data;
assert.equal(imp.imported, 1);
assert.equal((await call("parent", "POST", "/api/parent/messages", { body: "Proud of you, champ!" })).status, 200);
assert.equal((await call("parent", "POST", "/api/parent/settings", { player_name: "Champ", week_override: "2" })).status, 200);
st = (await call("kid", "GET", "/api/state")).data;
assert.equal(st.player, "Champ"); assert.equal(st.week, 2); assert.equal(st.message.body, "Proud of you, champ!");
assert.equal((await call("kid", "POST", `/api/messages/${st.message.id}/react`, { reaction: "high-five" })).status, 200);
const cheap = (await call("parent", "GET", "/api/parent/rewards")).data[0];
await call("parent", "POST", "/api/parent/rewards", { title: "Ice cream", cost: 1 });
const ice = (await call("parent", "GET", "/api/parent/rewards")).data.find((r) => r.title === "Ice cream");
assert.equal((await call("kid", "POST", `/api/rewards/${ice.id}/request`)).status, 200);
assert.equal((await call("parent", "POST", `/api/parent/rewards/${ice.id}`, { status: "approved" })).status, 200);
const after = (await call("parent", "GET", "/api/parent/rewards")).data.filter((r) => r.title === "Ice cream");
assert.equal(after.length, 2);
assert.equal((await call("parent", "GET", "/api/parent/events")).status, 200);

// worksheets: upload (questions + pdf), download, paper/OMR submit, skips, daily stats
const pdf = Buffer.from("%PDF-1.4 fake").toString("base64");
const up = await call("parent", "POST", "/api/parent/worksheets", { title: "Day 1", set_date: "2026-11-24", week: 2, pdf_base64: pdf, questions: [
  { q: "2+2?", a: "4", t: "Add", d: 1 }, { q: "Pick even", a: "1", o: ["3", "4", "5"], t: "Parity", d: 2 }, { q: "10-3?", a: "7", t: "Sub", d: 1 }] });
assert.equal(up.status, 200); assert.equal(up.data.questions, 3);
assert.equal((await call("parent", "POST", "/api/parent/worksheets", { title: "x", questions: [{ q: "no answer" }] })).status, 400);
assert.equal((await call("kid", "POST", "/api/parent/worksheets", { title: "x" })).status, 403);
const wl = (await call("kid", "GET", "/api/worksheets")).data;
assert.equal(wl[0].questions, 3); assert.ok(wl[0].has_pdf);
const wd = (await call("kid", "GET", `/api/worksheets/${up.data.id}`)).data;
assert.ok(!("answer" in wd.questions[0]), "worksheet answers must not leak");
const pdfRes = await handle(new Request(`http://localhost/api/worksheets/${up.data.id}/pdf`, { headers: { cookie: cookie.kid } }), env);
assert.equal(pdfRes.headers.get("content-type"), "application/pdf");
assert.equal(Buffer.from(await pdfRes.arrayBuffer()).toString().slice(0, 8), "%PDF-1.4");
const [qa, qb, qc] = wd.questions;
const sub = (await call("kid", "POST", `/api/worksheets/${up.data.id}/submit`, { minutes: 12, answers: { [qa.id]: "4", [qb.id]: "0", [qc.id]: "" } })).data;
assert.equal(sub.score, 1); assert.equal(sub.skipped, 1); assert.equal(sub.total, 3);
const before = (await call("kid", "GET", "/api/state")).data.totals;
const re = (await call("kid", "POST", `/api/worksheets/${up.data.id}/submit`, { minutes: 5, answers: { [qa.id]: "4", [qb.id]: "1", [qc.id]: "7" } })).data;
assert.equal(re.score, 3);
const afterRe = (await call("kid", "GET", "/api/state")).data.totals;
assert.equal(afterRe.runs - before.runs, re.runs - sub.runs, "repeat replaces the earlier score instead of adding");
assert.equal(afterRe.sessions, before.sessions);
const pd = (await call("parent", "GET", `/api/parent/sessions/${sub.session_id}`)).data;
assert.equal(pd.session.source, "paper"); assert.equal(pd.attempts.filter((a) => a.skipped).length, 1);
// on-screen play of a worksheet: unanswered questions become skipped rows at finish
const ws2 = (await call("kid", "POST", "/api/session/start", { kind: "worksheet", worksheet_id: up.data.id })).data;
assert.equal(ws2.questions.length, 3);
await call("kid", "POST", `/api/session/${ws2.session.id}/answer`, { question_id: ws2.questions[0].id, given: "4", time_ms: 5000 });
await call("kid", "POST", `/api/session/${ws2.session.id}/answer`, { question_id: ws2.questions[1].id, given: "", time_ms: 1000 });
await call("kid", "POST", `/api/session/${ws2.session.id}/finish`, {});
const d2 = (await call("parent", "GET", `/api/parent/sessions/${ws2.session.id}`)).data;
assert.equal(d2.attempts.length, 3); assert.equal(d2.attempts.filter((a) => a.skipped).length, 2);
const daily = (await call("parent", "GET", "/api/parent/daily?days=7")).data;
assert.ok(daily.length && daily.at(-1).paper_sessions >= 1 && daily.at(-1).minutes >= 12 && daily.at(-1).skipped === 2);
assert.equal((await call("parent", "DELETE", `/api/parent/worksheets/${up.data.id}`)).status, 200);
assert.equal((await call("kid", "GET", "/api/worksheets")).data.length, 0);
console.log("ALL API TESTS PASSED", cheap.title);
