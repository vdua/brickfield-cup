// Worksheet tickets #30, #31, #34: import into a worksheet, per-worksheet runs table, editing week/date.
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
const sql = (q, ...b) => env.DB.db.prepare(q).all(...b).map((r) => ({ ...r }));
const mk = (n, d) => Array.from({ length: n }, (_, i) => ({ q: `Q${i + 1}?`, a: '1', o: ['a', 'b', 'c', 'd'], t: 'T', d: d(i) }));
const list = async () => (await call('kid', 'GET', '/api/worksheets')).data;

// #34: a worksheet can be created empty, and is invisible until questions arrive
const ws = (await call('parent', 'POST', '/api/parent/worksheets', { title: 'Mock', set_date: today, week: 3, runs_table: { 1: 1, 3: 3 } })).data;
assert.ok(ws.id); assert.equal(ws.questions, 0); assert.deepEqual(ws.runs_table, { 1: 1, 3: 3 });
assert.equal((await list()).length, 0, 'empty worksheet hidden from the kid list');

// the empty (newest) worksheet must not hide an older full one in the Match slot
const old = (await call('parent', 'POST', '/api/parent/worksheets', { title: 'Old', set_date: today, week: 2, questions: mk(2, () => 1) })).data;
await call('parent', 'POST', '/api/parent/worksheets', { title: 'Empty', set_date: today, week: 2 });
await call('parent', 'POST', '/api/parent/plan/2/publish', { days: { match: today } });
const probe = (await call('kid', 'POST', '/api/session/start', { week: 2, slot: 'match' })).data;
assert.equal(probe.session.worksheet_id, old.id, 'newest non-empty worksheet is played');
await call('parent', 'POST', '/api/parent/plan/3/publish', { days: { match: today } });

// import: validation
const imp = (body) => call('parent', 'POST', '/api/parent/questions/import', body);
assert.equal((await imp({ worksheet_id: 99999, questions: mk(1, () => 1) })).status, 404);
assert.equal((await imp({ worksheet_id: ws.id, questions: [{ q: 'x' }] })).status, 400);
assert.equal(sql('SELECT id FROM questions WHERE worksheet_id=?', ws.id).length, 0, 'a bad batch stores nothing');

// import: links, forces kind and week, keeps order and per-question d
const qs = mk(5, (i) => (i < 3 ? 1 : 3));
const ok = await imp({ worksheet_id: ws.id, questions: qs.map((q) => ({ ...q, kind: 'practice', week: 9 })) });
assert.equal(ok.status, 200); assert.equal(ok.data.imported, 5);
const rows = sql('SELECT prompt, kind, week, difficulty, worksheet_id FROM questions WHERE worksheet_id=? ORDER BY id', ws.id);
assert.deepEqual(rows.map((r) => r.prompt), qs.map((q) => q.q), 'array order is question order');
assert.ok(rows.every((r) => r.kind === 'worksheet' && r.week === 3 && r.worksheet_id === ws.id));
assert.deepEqual(rows.map((r) => r.difficulty), [1, 1, 1, 3, 3]);
assert.deepEqual((await list()).map((x) => x.title).sort(), ['Mock', 'Old'], 'visible once it has questions; the empty one stays hidden');
assert.equal((await imp({ questions: mk(1, () => 1) })).data.imported, 1, 'plain import still makes bank questions');
assert.equal(sql('SELECT COUNT(*) n FROM questions WHERE worksheet_id IS NULL AND kind=\'worksheet\'')[0].n, 0);

// #31: validation of runs_table (POST and PUT)
for (const bad of [{ 4: 2 }, { 1: 0 }, { 1: 1.5 }, { 1: '2' }, [1, 2], 'x']) {
	assert.equal((await call('parent', 'POST', '/api/parent/worksheets', { title: 'Bad', runs_table: bad })).status, 400, JSON.stringify(bad));
	assert.equal((await call('parent', 'PUT', `/api/parent/worksheets/${ws.id}`, { runs_table: bad })).status, 400);
}
assert.equal(sql('SELECT COUNT(*) n FROM worksheets WHERE title=\'Bad\'')[0].n, 0);

// #30: week / set_date editing until a session exists
const put = (b) => call('parent', 'PUT', `/api/parent/worksheets/${ws.id}`, b);
assert.equal((await put({ week: -1 })).status, 400); assert.equal((await put({ week: 1.5 })).status, 400); assert.equal((await put({ set_date: 'tomorrow' })).status, 400);
assert.equal((await put({ week: 4, set_date: '2026-12-01' })).status, 200);
assert.deepEqual({ ...sql('SELECT week, set_date FROM worksheets WHERE id=?', ws.id)[0] }, { week: 4, set_date: '2026-12-01' });
assert.ok(sql('SELECT week FROM questions WHERE worksheet_id=?', ws.id).every((r) => r.week === 4), 'questions follow the worksheet week');
assert.equal((await put({ week: 3, set_date: today })).status, 200);

// play it: custom table pays 1 per d1 and 3 per d3 (max 11 here), fallback to the global table for missing keys
const st = (await call('kid', 'POST', '/api/session/start', { week: 3, slot: 'match' })).data;
assert.equal(st.session.worksheet_id, ws.id);
assert.equal((await imp({ worksheet_id: ws.id, questions: mk(1, () => 1) })).status, 409, 'no import once started');
assert.equal((await put({ week: 5 })).status, 409, 'no week change once started');
assert.equal((await put({ set_date: today })).status, 409);
assert.equal((await put({ runs_table: { 1: 1, 2: 2, 3: 4 } })).status, 200, 'table stays editable until handed in');
assert.equal((await put({ runs_table: { 1: 1, 3: 3 } })).status, 200);
const ans = Object.fromEntries(st.questions.map((q) => [q.id, '1'])); // option index 1 is the key ("a" is index 0, answer '1')
const done = (await call('kid', 'POST', `/api/worksheets/${ws.id}/submit`, { session_id: st.session.id, answers: ans })).data;
assert.equal(done.score, 5);
assert.equal(sql('SELECT SUM(runs) n FROM attempts WHERE session_id=?', st.session.id)[0].n, 3 * 1 + 2 * 3, 'custom table pays');
assert.equal((await put({ runs_table: null })).status, 409, 'locked once handed in');

// no table: global RUNS_FOR (d1 pays 2, d3 pays 6); partial table falls back per key
const g = (await call('parent', 'POST', '/api/parent/worksheets', { title: 'Global', set_date: today, week: 0, questions: mk(2, (i) => (i ? 3 : 2)), runs_table: { 3: 10 } })).data;
const gp = (await call('kid', 'POST', `/api/worksheets/${g.id}/submit`, { minutes: 1, answers: Object.fromEntries(sql('SELECT id FROM questions WHERE worksheet_id=?', g.id).map((r) => [r.id, '1'])) })).data;
assert.equal(sql('SELECT SUM(runs) n FROM attempts WHERE session_id=?', gp.session_id)[0].n, 4 + 10, 'missing key 2 falls back to the global 4');
console.log('ALL WORKSHEET IMPORT TESTS PASSED');
