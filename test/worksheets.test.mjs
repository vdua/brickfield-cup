// Worksheet play: drafts, resume with the real start time, handing in once, runs paid at the end.
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

const questions = [{ q: '2+2?', a: '4', t: 'Add', d: 1 }, { q: 'Pick even', a: '1', o: ['3', '4', '5'], t: 'Parity', d: 2 }, { q: '10-3?', a: '7', t: 'Sub', d: 1 }];
const up = (await call('parent', 'POST', '/api/parent/worksheets', { title: 'W3', set_date: today, week: 3, questions })).data;
await call('parent', 'POST', '/api/parent/plan/3/publish', { days: { match: today } });

// start: full question list, empty draft, worksheet id
const start = (await call('kid', 'POST', '/api/session/start', { week: 3, slot: 'match' })).data;
assert.equal(start.questions.length, 3); assert.deepEqual(start.draft, {});
assert.equal(start.session.worksheet_id, up.id);
const sid = start.session.id;
const [q1, q2, q3] = start.questions;

// no per-answer grading, no finishing without handing in
assert.equal((await call('kid', 'POST', `/api/session/${sid}/answer`, { question_id: q1.id, given: '4' })).status, 400);
assert.equal((await call('kid', 'POST', `/api/session/${sid}/finish`, {})).status, 400);

// drafts replace each other, ignore foreign question ids, and need a worksheet session
assert.equal((await call('kid', 'PUT', `/api/session/${sid}/draft`, { answers: { [q1.id]: '5', 99999: 'x' } })).data.saved, 1);
assert.equal((await call('kid', 'PUT', `/api/session/${sid}/draft`, { answers: { [q1.id]: '4', [q2.id]: '1' } })).data.saved, 2);
assert.equal((await call('kid', 'PUT', `/api/session/${sid}/draft`, { answers: [] })).status, 400);
assert.equal((await call('kid', 'PUT', '/api/session/99999/draft', { answers: {} })).status, 404);

// starting again (another device) resumes the same session with the original start time and the draft
const again = (await call('kid', 'POST', '/api/session/start', { week: 3, slot: 'match' })).data;
assert.equal(again.session.id, sid); assert.equal(again.session.started_at, start.session.started_at, 'the clock keeps the real start');
assert.deepEqual(again.draft, { [q1.id]: '4', [q2.id]: '1' }); assert.equal(again.questions.length, 3);

// hand in: marked together, runs paid now, draft removed, once only
const before = (await call('kid', 'GET', '/api/state')).data.totals;
const done = await call('kid', 'POST', `/api/worksheets/${up.id}/submit`, { session_id: sid, answers: { [q1.id]: '4', [q2.id]: '1', [q3.id]: '' } });
assert.equal(done.status, 200); assert.equal(done.data.score, 2); assert.equal(done.data.skipped, 1);
assert.equal(done.data.session_id, sid); assert.equal(done.data.review.length, 3);
assert.ok(done.data.runs > 0 && done.data.totals.runs - before.runs >= done.data.runs);
assert.equal(done.data.stages.length > 0, true);
assert.equal(env.DB.db.prepare('SELECT COUNT(*) n FROM worksheet_drafts').get().n, 0);
assert.equal((await call('kid', 'PUT', `/api/session/${sid}/draft`, { answers: {} })).status, 409);
assert.equal((await call('kid', 'POST', `/api/worksheets/${up.id}/submit`, { session_id: sid, answers: {} })).status, 409);
assert.equal((await call('kid', 'POST', `/api/worksheets/${up.id}/submit`, { minutes: 5, answers: {} })).status, 409);
assert.equal((await call('kid', 'POST', '/api/session/start', { week: 3, slot: 'match' })).status, 409, 'the Match slot is closed once handed in');

// a session from another worksheet cannot be handed in here
const other = (await call('parent', 'POST', '/api/parent/worksheets', { title: 'Free', set_date: today, week: 0, questions })).data;
assert.equal((await call('kid', 'POST', `/api/worksheets/${other.id}/submit`, { session_id: sid, answers: {} })).status, 404);
// a worksheet without a session (paper) still works, once, with the typed minutes
const paper = await call('kid', 'POST', `/api/worksheets/${other.id}/submit`, { minutes: 10, answers: {} });
assert.equal(paper.status, 200); assert.equal(paper.data.skipped, 3);
assert.equal((await call('parent', 'GET', `/api/parent/sessions/${paper.data.session_id}`)).data.session.source, 'paper');
// Replay picks the skipped question of a handed-in worksheet
const replay = await call('kid', 'POST', '/api/session/start', { kind: 'revision' });
assert.equal(replay.status, 200); assert.ok(replay.data.questions.some((q) => q.id === q3.id), 'skipped worksheet question comes back in Replay');

// mode and clock can be changed until the worksheet is handed in
const sh = (await call('parent', 'POST', '/api/parent/worksheets', { title: 'Edit me', set_date: today, week: 0, questions, mode: 'screen', time_limit_min: 20 })).data;
const edit = (b) => call('parent', 'PUT', `/api/parent/worksheets/${sh.id}`, b);
const row = () => env.DB.db.prepare('SELECT mode, time_limit_min FROM worksheets WHERE id=?').get(sh.id);
assert.equal((await edit({ mode: 'paper' })).status, 200); assert.deepEqual({ ...row() }, { mode: 'paper', time_limit_min: 20 }, 'only what is sent changes');
assert.equal((await edit({ time_limit_min: null })).status, 200); assert.deepEqual({ ...row() }, { mode: 'paper', time_limit_min: null }, 'null removes the clock');
assert.equal((await edit({ mode: 'phone' })).status, 400); assert.equal((await edit({ time_limit_min: 0 })).status, 400); assert.equal((await edit({ time_limit_min: 241 })).status, 400);
assert.equal((await call('parent', 'PUT', '/api/parent/worksheets/99999', { mode: 'paper' })).status, 404);
assert.equal((await call('kid', 'PUT', `/api/parent/worksheets/${sh.id}`, { mode: 'screen' })).status, 403, 'parents only');
assert.equal((await call('kid', 'POST', `/api/worksheets/${sh.id}/submit`, { minutes: 5, answers: {} })).status, 200);
assert.equal((await edit({ mode: 'screen' })).status, 409, 'locked once handed in'); assert.equal(row().mode, 'paper');
console.log('ALL WORKSHEET TESTS PASSED');
