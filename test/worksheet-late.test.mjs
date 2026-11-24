// Worksheet time limit, mode and the late rule, on a fresh database.
import assert from 'node:assert/strict';
import { makeEnv } from './dev-server.mjs';
import { handle } from '../lib/api.js';

const env = makeEnv(':memory:');
const cookie = { kid: '', parent: '' };
async function call(who, method, path, body) {
	const r = await handle(new Request(`http://localhost${path}`, {
		method, headers: { 'content-type': 'application/json', cookie: cookie[who] || '' }, body: body ? JSON.stringify(body) : undefined,
	}), env);
	const sc = r.headers.get('set-cookie');
	if (sc && who) [cookie[who]] = sc.split(';');
	return { status: r.status, data: await r.json() };
}
await call('kid', 'POST', '/api/login', { role: 'kid', pin: '1234' });
await call('parent', 'POST', '/api/login', { role: 'parent', pin: '9999' });
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const questions = [{ q: '2+2?', a: '4', t: 'Add', d: 1 }, { q: '10-3?', a: '7', t: 'Sub', d: 1 }];
const upload = (extra) => call('parent', 'POST', '/api/parent/worksheets', {
	title: 'W', set_date: today, week: 3, questions, ...extra,
});

// validation, defaults and the list
assert.equal((await upload({ time_limit_min: 0 })).status, 400);
assert.equal((await upload({ time_limit_min: 500 })).status, 400);
const sheet = (await upload({ mode: 'paper', time_limit_min: 30 })).data;
assert.equal(sheet.mode, 'paper'); assert.equal(sheet.time_limit_min, 30);
const listed = (await call('kid', 'GET', '/api/worksheets')).data[0];
assert.equal(listed.mode, 'paper'); assert.equal(listed.time_limit_min, 30); assert.equal(listed.in_progress, false);
await call('parent', 'POST', '/api/parent/plan/3/publish', { days: { match: today } });

// start: the server sets source from the mode and sends the limit and its own time
const start = (await call('kid', 'POST', '/api/session/start', { week: 3, slot: 'match' })).data;
assert.equal(start.session.mode, 'paper'); assert.equal(start.session.time_limit_min, 30); assert.ok(start.session.now);
assert.equal(env.DB.db.prepare('SELECT source FROM sessions WHERE id=?').get(start.session.id).source, 'paper');
assert.equal((await call('kid', 'GET', '/api/worksheets')).data[0].in_progress, true);
const again = { week: 3, slot: 'match' };
const resumed = (await call('kid', 'POST', '/api/session/start', again)).data;
assert.equal(resumed.session.time_limit_min, 30, 'resume carries the limit');

// 40 minutes after starting is late: nothing is paid, no badge, the day is not a streak day, the review still comes back
env.DB.exec(`UPDATE sessions SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', started_at, '-40 minutes') WHERE id=${start.session.id}`);
const [q1, q2] = start.questions;
const late = (await call('kid', 'POST', `/api/worksheets/${sheet.id}/submit`, { session_id: start.session.id, answers: { [q1.id]: '4', [q2.id]: '7' } })).data;
assert.equal(late.late, true); assert.equal(late.runs, 0);
assert.equal(late.score, 2); assert.equal(late.review.length, 2);
assert.deepEqual(late.newBadges, []); assert.equal(late.bonus.runs, 0);
const row = env.DB.db.prepare('SELECT late, runs, duration_s FROM sessions WHERE id=?').get(start.session.id);
assert.equal((await call('parent', 'GET', '/api/parent/sessions')).data.find((x) => x.id === start.session.id).late, 1);
assert.equal((await call('kid', 'GET', '/api/worksheets')).data.find((x) => x.id === sheet.id).late, true);
assert.equal(row.late, 1); assert.equal(row.runs, 0); assert.equal(row.duration_s, 30 * 60, 'duration is capped at the limit');
const st = (await call('kid', 'GET', '/api/state')).data;
assert.equal(st.totals.runs, 0); assert.equal(st.streak, 0); assert.equal(st.regularity.nextBonus, 1, 'today is still unplayed for the streak');
assert.equal((await call('kid', 'POST', `/api/worksheets/${sheet.id}/submit`, { session_id: start.session.id, answers: {} })).status, 409, 'late is final');

// on time (10 minutes in, limit 30) pays runs and counts as a played day
await call('parent', 'POST', '/api/parent/plan/4/publish', { days: { match: today } });
const sheet4 = (await call('parent', 'POST', '/api/parent/worksheets', {
	title: 'W4', set_date: today, week: 4, time_limit_min: 30, questions,
})).data;
const s4 = (await call('kid', 'POST', '/api/session/start', { week: 4, slot: 'match' })).data;
assert.equal(s4.session.mode, 'screen');
env.DB.exec(`UPDATE sessions SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', started_at, '-10 minutes') WHERE id=${s4.session.id}`);
const ok = (await call('kid', 'POST', `/api/worksheets/${sheet4.id}/submit`, { session_id: s4.session.id, answers: { [s4.questions[0].id]: '4' } })).data;
assert.equal(ok.late, false); assert.ok(ok.runs > 0);
assert.equal((await call('kid', 'GET', '/api/state')).data.regularity.nextBonus, null, 'today now counts');
console.log('ALL WORKSHEET LATE TESTS PASSED');
