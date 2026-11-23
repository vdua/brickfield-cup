// End-to-end API test against the local SQLite stand-in: node test/api.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv } from './dev-server.mjs';
import { handle, isCorrect } from '../lib/api.js';
import { replay } from '../lib/api/streak.js';

const env = makeEnv(':memory:');
const bank = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url)));
const cookie = { kid: '', parent: '' };
async function call(who, method, path, body) {
	const r = await handle(new Request(`http://localhost${path}`, {
		method, headers: { 'content-type': 'application/json', cookie: cookie[who] || '' }, body: body ? JSON.stringify(body) : undefined,
	}), env);
	const sc = r.headers.get('set-cookie');
	if (sc && who) [cookie[who]] = sc.split(';');
	return { status: r.status, data: await r.json() };
}

const addDay = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// time travel: move every stored date back a day, which is the same as the clock moving forward one day
const nextDay = () => env.DB.exec(`
  UPDATE sessions SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', started_at, '-1 day'), ended_at = CASE WHEN ended_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', ended_at, '-1 day') END;
  UPDATE week_slots SET day = date(day, '-1 day'); UPDATE daily_bonus SET day = date(day, '-1 day'); UPDATE holidays SET day = date(day, '-1 day');`);
const answerAll = async (d) => {
	for (const q of d.questions) await call('kid', 'POST', `/api/session/${d.session.id}/answer`, { question_id: q.id, given: q.options ? '0' : '1', time_ms: 9000 });
	return (await call('kid', 'POST', `/api/session/${d.session.id}/finish`, {})).data;
};
const playSlot = async (week, slot) => {
	const s = await call('kid', 'POST', '/api/session/start', { week, slot });
	assert.equal(s.status, 200, `${slot}: ${s.data.error}`);
	return { start: s.data, fin: await answerAll(s.data) };
};
const slotsOf = async (week) => Object.fromEntries((await call('parent', 'GET', `/api/parent/plan/${week}`)).data.slots.map((x) => [x.slot, x]));

// answer checker
assert.ok(isCorrect({ answer: '25/6' }, '4 1/6'));
assert.ok(isCorrect({ answer: '3.5' }, '3.5 hours'));
assert.ok(isCorrect({ answer: '400' }, '₹400'));
assert.ok(isCorrect({ answer: '400' }, '1,300') === false);
assert.ok(isCorrect({ answer: '0.1' }, '1/10'));
assert.ok(isCorrect({ answer: '1', options: '[]' }, '1'));
assert.ok(!isCorrect({ answer: '42' }, ''));

// auth
assert.equal((await call('kid', 'GET', '/api/state')).status, 401);
assert.equal((await call('x', 'POST', '/api/login', { role: 'kid', pin: '0000' })).status, 401);
assert.equal((await call('kid', 'POST', '/api/login', { role: 'kid', pin: '1234' })).status, 200);
assert.equal((await call('parent', 'POST', '/api/login', { role: 'parent', pin: '9999' })).status, 200);
assert.equal((await call('kid', 'GET', '/api/parent/overview')).status, 403);

// regularity: rest days, holidays, bonus
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
assert.equal((await call('parent', 'POST', '/api/parent/settings', { rest_days: '' })).status, 200);
assert.equal((await call('parent', 'POST', '/api/parent/holidays', { day: today, note: 'Test holiday' })).status, 200);
const blocked = await call('kid', 'POST', '/api/session/start', { kind: 'practice' });
assert.equal(blocked.status, 403);
assert.ok(blocked.data.error.includes('holiday: Test holiday'));
assert.equal((await call('kid', 'GET', '/api/state')).data.regularity.rest, 'holiday: Test holiday');
assert.equal((await call('parent', 'DELETE', `/api/parent/holidays/${today}`)).status, 200);
const none = () => null;
const day = (n, wickets = 0) => ({ day: `2026-12-${String(n).padStart(2, '0')}`, wickets }); // 2026-12-01 is a Tuesday
let rp = replay([day(1), day(2), day(3)], none, '2026-12-03');
assert.deepEqual([rp.streak, [...rp.dayBonus.values()]], [3, [1, 2, 3]]);
rp = replay([day(1), day(2), day(4)], none, '2026-12-04');
assert.deepEqual([rp.streak, [...rp.dayBonus.values()]], [1, [1, 2, 1]]); // missed 3 Dec resets
const friday = (d) => (new Date(`${d}T00:00:00Z`).getUTCDay() === 5 ? 'rest day' : null);
rp = replay([day(3), day(5)], friday, '2026-12-05'); // 4 Dec is a Friday: skipping it keeps the streak
assert.deepEqual([rp.streak, [...rp.dayBonus.values()]], [2, [1, 2]]);
rp = replay(Array.from({ length: 9 }, (_, i) => day(i + 6)), none, '2026-12-14'); // days 6-14
assert.deepEqual([...rp.dayBonus.values()], [1, 2, 3, 4, 5, 6, 6, 6, 6]); // capped at 6
rp = replay([day(1, 6), day(2, 4)], none, '2026-12-02'); // 10 wickets reset it after the second innings
assert.equal(rp.streak, 0);
rp = replay([day(1, 6), day(2, 3)], none, '2026-12-03');
assert.deepEqual([rp.streak, rp.wicketsLeft, rp.nextBonus], [2, 1, 3]);

// state: nothing is playable until the parent publishes the week
let st = (await call('kid', 'GET', '/api/state')).data;
assert.equal(st.plan.published, false);
assert.equal(st.plan.slots.length, 7);
assert.ok(st.plan.slots.every((x) => x.status === 'unpublished'));
assert.equal((await call('kid', 'POST', '/api/session/start', { kind: 'practice' })).status, 400, 'gated kinds need a slot');
assert.equal((await call('kid', 'POST', '/api/session/start', { kind: 'practice', slot: 'nets1', week: 2 })).status, 403);
assert.equal((await call('kid', 'GET', '/api/parent/plan/2')).status, 403);
assert.equal((await call('parent', 'GET', '/api/parent/plan/20')).status, 400);

// play a diagnostic: answer correctly except 3
const start = (await call('kid', 'POST', '/api/session/start', { kind: 'diagnostic', week: 1 })).data;
assert.equal(start.questions.length, 20);
assert.ok(!('answer' in start.questions[0]), 'answers must not leak');
const diag = bank.filter((q) => q.k === 'diagnostic');
let wrongAttempt;
for (const [i, q] of start.questions.entries()) {
	const src = diag.find((d) => d.q === q.prompt);
	const given = i % 7 === 3 ? '999' : src.a;
	const r = (await call('kid', 'POST', `/api/session/${start.session.id}/answer`, { question_id: q.id, given, time_ms: 30000 })).data;
	assert.equal(r.correct, given === src.a, `q${i}`);
	if (!r.correct) wrongAttempt = r.attempt_id;
}
assert.equal((await call('kid', 'POST', `/api/session/${start.session.id}/answer`, { question_id: start.questions[0].id, given: '1' })).status, 409);
assert.equal((await call('kid', 'POST', `/api/attempt/${wrongAttempt}/mistake`, { type: 'careless' })).status, 200);
const fin = (await call('kid', 'POST', `/api/session/${start.session.id}/finish`, { away_s: 12, away_count: 2 })).data;
console.log('diagnostic finished:', fin.session.score, '/', fin.session.total, 'runs', fin.session.runs, 'badges', fin.newBadges.map((b) => b.code));
assert.equal(fin.session.score, 17);
assert.ok(fin.newBadges.some((b) => b.code === 'first_innings'));
assert.equal(fin.bonus.runs, 0); // nothing published, so today is not a working day: no bonus

// replay is the one ungated extra, but it only serves real unfixed mistakes
{
	const wrongIds = new Set((await env.DB.prepare('SELECT DISTINCT question_id id FROM attempts WHERE correct=0').all()).results.map((x) => x.id));
	assert.ok((await call('kid', 'GET', '/api/state')).data.replay.due > 0, 'mistakes are waiting');
	env.DB.exec(`UPDATE questions SET active=0 WHERE id IN (${[...wrongIds].join(',')})`); // no replayable mistakes left
	assert.equal((await call('kid', 'GET', '/api/state')).data.replay.due, 0);
	assert.equal((await call('kid', 'POST', '/api/session/start', { kind: 'revision', week: 2 })).status, 404, 'no mistakes, no replay');
	env.DB.exec(`UPDATE questions SET active=1 WHERE id IN (${[...wrongIds].join(',')})`);
	const s = await call('kid', 'POST', '/api/session/start', { kind: 'revision', week: 2 });
	assert.equal(s.status, 200);
	assert.ok(s.data.questions.length <= 5 && s.data.questions.every((q) => wrongIds.has(q.id)), 'only questions he got wrong');
	const before = (await call('kid', 'GET', '/api/state')).data;
	const f = await answerAll(s.data);
	assert.equal(f.session.runs, 0, 'replay pays no runs');
	assert.equal(f.totals.runs, before.totals.runs, 'replay leaves total runs unchanged');
	assert.equal(f.bonus.runs, 0, 'replay never pays the regularity bonus');
	const after = (await call('kid', 'GET', '/api/state')).data;
	assert.deepEqual([after.streak, after.regularity.wicketsLeft], [before.streak, before.regularity.wicketsLeft], 'replay does not touch the streak or its wickets');
	assert.equal(after.playedToday, before.playedToday);
}

// publishing week 2: Nets 1 was yesterday (missed), Nets 2 is today, the rest are ahead; Match is in the past so the worksheet below can count
assert.equal((await call('parent', 'POST', '/api/parent/plan/2/publish', { days: { nets1: 'bad' } })).status, 400);
const pub = (await call('parent', 'POST', '/api/parent/plan/2/publish', { days: { nets1: addDay(today, -1), nets2: today, nets3: addDay(today, 1), puzzle: addDay(today, 2), toss: addDay(today, 3), match: addDay(today, -1), over: addDay(today, 4) } })).data;
assert.equal(pub.published, true);
let sl = await slotsOf(2);
assert.deepEqual(['missed', 'open', 'locked', 'locked', 'locked', 'na', 'locked'], ['nets1', 'nets2', 'nets3', 'puzzle', 'toss', 'match', 'over'].map((k) => sl[k].status));
// future slots can never be started, whatever the client says
for (const slot of ['nets3', 'puzzle', 'toss', 'over']) assert.equal((await call('kid', 'POST', '/api/session/start', { week: 2, slot })).status, 403, slot);
assert.equal((await call('kid', 'POST', '/api/session/start', { week: 2, slot: 'match' })).status, 404, 'no worksheet yet');
assert.equal((await call('kid', 'POST', '/api/session/start', { kind: 'after', week: 2, slot: 'nets3' })).status, 403, 'the slot decides, not the kind');

// today's slot is played; a second one the same day is refused, even a missed one
{
	const a = await playSlot(2, 'nets2');
	assert.equal(a.start.session.slot, 'nets2');
	assert.equal(a.start.questions.length, 4);
	assert.equal((await call('kid', 'POST', '/api/session/start', { week: 2, slot: 'nets1' })).status, 403);
	assert.equal((await call('kid', 'POST', '/api/session/start', { week: 2, slot: 'nets2' })).status, 409, 'already done');
}
sl = await slotsOf(2);
assert.equal(sl.nets2.status, 'done'); assert.equal(sl.nets2.late, false);

// tomorrow the missed Nets 1 can be caught up: it counts, but as late
nextDay();
sl = await slotsOf(2);
assert.deepEqual([sl.nets1.status, sl.nets3.status], ['missed', 'open']);
await playSlot(2, 'nets1');
sl = await slotsOf(2);
assert.equal(sl.nets1.status, 'done'); assert.equal(sl.nets1.late, true);
assert.ok(!(await call('kid', 'GET', '/api/state')).data.badges.find((b) => b.code === 'full_match').earned_at, 'a late mission spoils the clean week');

// week 1 format: 6 before, 4 practice, 6 puzzle, 6 after (one a day)
assert.equal((await call('parent', 'POST', '/api/parent/plan/1/publish', { days: Object.fromEntries(['nets1', 'nets2', 'nets3', 'puzzle', 'toss', 'match', 'over'].map((k) => [k, addDay(today, -30)])) })).status, 200);
for (const [slot, n] of [['toss', 6], ['nets1', 4], ['puzzle', 6], ['over', 6]]) {
	nextDay();
	assert.equal((await playSlot(1, slot)).start.questions.length, n, `week 1 ${slot}`);
}

// a clean week earns Full Match: week 4 has Nets Mon-Wed(Wed is a holiday), puzzle, toss, super over; no worksheet
for (const kind of ['before', 'after']) assert.equal((await call('parent', 'POST', '/api/parent/questions', { week: 4, kind, topic: 'Patterns', difficulty: 1, prompt: `4 ${kind}?`, answer: '1' })).status, 200);
nextDay();
const t0 = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
assert.equal((await call('parent', 'POST', '/api/parent/plan/4/publish', { days: { nets1: t0, nets2: addDay(t0, 1), nets3: addDay(t0, 2), puzzle: addDay(t0, 3), toss: addDay(t0, 4), match: addDay(t0, 4), over: addDay(t0, 5) } })).status, 200);
assert.equal((await call('parent', 'POST', '/api/parent/holidays', { day: addDay(t0, 2), note: 'Test holiday' })).status, 200);
const order = ['nets1', 'nets2', null, 'puzzle', 'toss', 'over']; // null = the holiday: nothing to play
let gotBadge = false;
for (const slot of order) {
	if (slot) {
		const r = await playSlot(4, slot);
		if (r.fin.newBadges.some((b) => b.code === 'full_match')) gotBadge = true;
		if (slot !== 'over') assert.ok(!gotBadge, 'badge only after the last mission');
	} else {
		assert.equal((await slotsOf(4)).nets3.status, 'skip');
		assert.equal((await call('kid', 'POST', '/api/session/start', { week: 4, slot: 'nets3' })).status, 403);
	}
	if (slot !== 'over') nextDay();
}
assert.ok(gotBadge, 'Full Match after finishing every playable mission on its own day');
env.DB.exec('DELETE FROM holidays');
st = (await call('kid', 'GET', '/api/state')).data;
console.log('totals', st.totals, 'streak', st.streak, 'stage', st.stadium.stage);

// a day allows as many missions as were scheduled on it: two on one day, a third (a missed one) is refused
nextDay();
assert.equal((await call('parent', 'POST', '/api/parent/plan/6/publish', { days: { nets1: t0, nets2: t0, nets3: addDay(t0, -1), puzzle: addDay(t0, 2), toss: addDay(t0, 3), match: addDay(t0, 3), over: addDay(t0, 4) } })).status, 200);
await playSlot(6, 'nets1');
await playSlot(6, 'nets2');
assert.equal((await call('kid', 'POST', '/api/session/start', { week: 6, slot: 'nets3' })).status, 403);
env.DB.exec('DELETE FROM week_slots WHERE week = 6');

// rewards: request one we can't afford
const big = st.rewards.find((r) => r.cost > st.totals.wallet);
assert.equal((await call('kid', 'POST', `/api/rewards/${big.id}/request`)).status, 400);

// parent
const ov = (await call('parent', 'GET', '/api/parent/overview')).data;
assert.equal(ov.tracker.length, 19);
assert.equal(ov.weekMax.week, ov.week);
assert.ok(ov.totals.bonus >= 1);
{ // week 2 has practice/before/after loaded, so its maximum is a positive total with the 6-day bonus
	const w2 = (await call('parent', 'GET', '/api/parent/overview')).data;
	assert.ok(w2.weekMax.total.max > 0 && w2.weekMax.bonus.max >= w2.weekMax.bonus.banked);
	assert.ok(w2.weekMax.parts.every((p) => p.max >= 0 && !('min' in p)));
}
assert.ok(ov.tracker[0].before.total === 6);
console.log('week1 tracker', ov.tracker[0], 'topics', ov.topics.length, 'daily', ov.daily.slice(-1)[0]);
const errs = (await call('parent', 'GET', '/api/parent/errors')).data;
assert.ok(errs.length > 0 && errs.some((e) => e.mistake === 'careless'));
const sessList = (await call('parent', 'GET', '/api/parent/sessions')).data;
const det = (await call('parent', 'GET', `/api/parent/sessions/${sessList.at(-1).id}`)).data;
assert.equal(det.attempts.length, 20);
assert.equal((await call('parent', 'POST', '/api/parent/questions', { week: 6, kind: 'mock', topic: 'Mixed', difficulty: 2, prompt: '2+2?', answer: '4' })).status, 200);
assert.equal((await call('parent', 'POST', '/api/parent/questions', { prompt: 'pick', answer: '5', options: ['a', 'b'] })).status, 400);
const imp = (await call('parent', 'POST', '/api/parent/questions/import', { questions: [{ w: 7, k: 'before', t: 'Percentage', d: 1, q: '10% of 50?', a: '5' }] })).data;
assert.equal(imp.imported, 1);
assert.equal((await call('parent', 'POST', '/api/parent/messages', { body: 'Proud of you, champ!' })).status, 200);
assert.equal((await call('parent', 'POST', '/api/parent/settings', { player_name: 'Champ', week_override: '2' })).status, 200);
st = (await call('kid', 'GET', '/api/state')).data;
assert.equal(st.player, 'Champ'); assert.equal(st.week, 2);
assert.equal(st.plan.published, true); assert.equal(st.plan.slots.find((x) => x.slot === 'nets1').status, 'done'); assert.equal(st.message.body, 'Proud of you, champ!');
assert.equal((await call('kid', 'POST', `/api/messages/${st.message.id}/react`, { reaction: 'high-five' })).status, 200);
const cheap = (await call('parent', 'GET', '/api/parent/rewards')).data[0];
await call('parent', 'POST', '/api/parent/rewards', { title: 'Ice cream', cost: 1 });
const ice = (await call('parent', 'GET', '/api/parent/rewards')).data.find((r) => r.title === 'Ice cream');
assert.equal((await call('kid', 'POST', `/api/rewards/${ice.id}/request`)).status, 200);
assert.equal((await call('parent', 'POST', `/api/parent/rewards/${ice.id}`, { status: 'approved' })).status, 200);
const after = (await call('parent', 'GET', '/api/parent/rewards')).data.filter((r) => r.title === 'Ice cream');
assert.equal(after.length, 2);
assert.equal((await call('parent', 'GET', '/api/parent/events')).status, 200);

// worksheets: upload (questions + pdf), download, paper/OMR submit, skips, daily stats
const pdf = Buffer.from('%PDF-1.4 fake').toString('base64');
const up = await call('parent', 'POST', '/api/parent/worksheets', { title: 'Day 1',
	set_date: '2026-11-24',
	week: 2,
	pdf_base64: pdf,
	questions: [
		{ q: '2+2?', a: '4', t: 'Add', d: 1 }, { q: 'Pick even', a: '1', o: ['3', '4', '5'], t: 'Parity', d: 2 }, { q: '10-3?', a: '7', t: 'Sub', d: 1 }] });
assert.equal(up.status, 200); assert.equal(up.data.questions, 3);
assert.equal((await call('parent', 'POST', '/api/parent/worksheets', { title: 'x', questions: [{ q: 'no answer' }] })).status, 400);
assert.equal((await call('kid', 'POST', '/api/parent/worksheets', { title: 'x' })).status, 403);
const wl = (await call('kid', 'GET', '/api/worksheets')).data;
assert.equal(wl[0].questions, 3); assert.ok(wl[0].has_pdf);
const wd = (await call('kid', 'GET', `/api/worksheets/${up.data.id}`)).data;
assert.ok(!('answer' in wd.questions[0]), 'worksheet answers must not leak');
const pdfRes = await handle(new Request(`http://localhost/api/worksheets/${up.data.id}/pdf`, { headers: { cookie: cookie.kid } }), env);
assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
assert.equal(Buffer.from(await pdfRes.arrayBuffer()).toString().slice(0, 8), '%PDF-1.4');
const [qa, qb, qc] = wd.questions;
const sub = (await call('kid', 'POST', `/api/worksheets/${up.data.id}/submit`, { minutes: 12, answers: { [qa.id]: '4', [qb.id]: '0', [qc.id]: '' } })).data;
assert.equal(sub.score, 1); assert.equal(sub.skipped, 1); assert.equal(sub.total, 3);
const before = (await call('kid', 'GET', '/api/state')).data.totals;
const re = (await call('kid', 'POST', `/api/worksheets/${up.data.id}/submit`, { minutes: 5, answers: { [qa.id]: '4', [qb.id]: '1', [qc.id]: '7' } })).data;
assert.equal(re.score, 3);
const afterRe = (await call('kid', 'GET', '/api/state')).data.totals;
assert.equal(afterRe.runs - before.runs, re.runs - sub.runs, 'repeat replaces the earlier score instead of adding');
assert.equal(afterRe.sessions, before.sessions);
const pd = (await call('parent', 'GET', `/api/parent/sessions/${sub.session_id}`)).data;
assert.equal(pd.session.source, 'paper'); assert.equal(pd.attempts.filter((a) => a.skipped).length, 1);
// the Match is a slot: a week-5 sheet whose Match is still ahead can't be handed in, and a week-3 sheet is played on screen today
const sheet = (week) => ({ title: `W${week}`, set_date: t0, week, questions: [{ q: '2+2?', a: '4', t: 'Add', d: 1 }, { q: 'Pick even', a: '1', o: ['3', '4', '5'], t: 'Parity', d: 2 }, { q: '10-3?', a: '7', t: 'Sub', d: 1 }] });
const w5 = (await call('parent', 'POST', '/api/parent/worksheets', sheet(5))).data;
await call('parent', 'POST', '/api/parent/plan/5/publish', { days: { match: addDay(t0, 2) } });
assert.equal((await call('kid', 'POST', `/api/worksheets/${w5.id}/submit`, { minutes: 5, answers: {} })).status, 403);
assert.equal((await call('kid', 'POST', '/api/session/start', { week: 5, slot: 'match' })).status, 403);
const w3 = (await call('parent', 'POST', '/api/parent/worksheets', sheet(3))).data;
await call('parent', 'POST', '/api/parent/plan/3/publish', { days: { match: t0 } });
// on-screen play of a worksheet: unanswered questions become skipped rows at finish
const ws2 = (await call('kid', 'POST', '/api/session/start', { week: 3, slot: 'match' })).data;
assert.equal(ws2.questions.length, 3); assert.equal(ws2.session.slot, 'match');
await call('kid', 'POST', `/api/session/${ws2.session.id}/answer`, { question_id: ws2.questions[0].id, given: '4', time_ms: 5000 });
await call('kid', 'POST', `/api/session/${ws2.session.id}/answer`, { question_id: ws2.questions[1].id, given: '', time_ms: 1000 });
await call('kid', 'POST', `/api/session/${ws2.session.id}/finish`, {});
const d2 = (await call('parent', 'GET', `/api/parent/sessions/${ws2.session.id}`)).data;
assert.equal(d2.attempts.length, 3); assert.equal(d2.attempts.filter((a) => a.skipped).length, 2);
assert.equal((await slotsOf(3)).match.status, 'done');
assert.equal((await slotsOf(2)).match.status, 'done'); assert.equal((await slotsOf(2)).match.late, true);
const daily = (await call('parent', 'GET', '/api/parent/daily?days=7')).data;
assert.ok(daily.length && daily.at(-1).paper_sessions >= 1 && daily.at(-1).minutes >= 12 && daily.at(-1).skipped === 2);
assert.equal((await call('parent', 'DELETE', `/api/parent/worksheets/${up.data.id}`)).status, 200);
await call('parent', 'DELETE', `/api/parent/worksheets/${w5.id}`); await call('parent', 'DELETE', `/api/parent/worksheets/${w3.id}`);
assert.equal((await call('kid', 'GET', '/api/worksheets')).data.length, 0);
// parent guides: taught flag
assert.equal((await call('kid', 'GET', '/api/parent/guides/status')).status, 403);
assert.deepEqual((await call('parent', 'GET', '/api/parent/guides/status')).data, []);
assert.equal((await call('parent', 'POST', '/api/parent/guides/0/taught', {})).status, 400);
assert.equal((await call('parent', 'POST', '/api/parent/guides/20/taught', {})).status, 400);
const gt = (await call('parent', 'POST', '/api/parent/guides/1/taught', {})).data;
assert.equal(gt.week, 1); assert.ok(gt.taught_at);
assert.equal((await call('parent', 'POST', '/api/parent/guides/1/taught', {})).status, 200); // repeat is harmless
const gs = (await call('parent', 'GET', '/api/parent/guides/status')).data;
assert.equal(gs.length, 1); assert.equal(gs[0].week, 1);
assert.equal((await call('parent', 'POST', '/api/parent/guides/1/taught', { taught: false })).data.taught_at, null);
assert.deepEqual((await call('parent', 'GET', '/api/parent/guides/status')).data, []);
console.log('ALL API TESTS PASSED', cheap.title);
