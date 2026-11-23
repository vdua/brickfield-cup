// Fills test/local.sqlite with ~12 days of simulated play so the dashboards have something to show.
// node test/demo-data.mjs   (then: node test/dev-server.mjs)
import { rmSync, readFileSync } from 'node:fs';
import { makeEnv } from './dev-server.mjs';
import { handle } from '../lib/api.js';

const file = new URL('./local.sqlite', import.meta.url).pathname;
rmSync(file, { force: true });
const env = makeEnv(file);
const bank = JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url)));
let cookie = '';
const call = async (method, path, body) => {
	const r = await handle(new Request(`http://localhost${path}`, {
		method,
		headers: { 'content-type': 'application/json', cookie },
		body: body ? JSON.stringify(body) : undefined,
	}), env);
	const sc = r.headers.get('set-cookie');
	if (sc) [cookie] = sc.split(';');
	return r.json();
};
await call('POST', '/api/login', { role: 'kid', pin: '1234' });
const rnd = (() => {
	let s = 7;
	return () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
})();
const { db } = env.DB;

async function playSession(kind, week, skill, daysAgo, hour) {
	const st = await call('POST', '/api/session/start', { kind, week });
	if (!st.session) return;
	for (const q of st.questions) {
		const src = bank.find((b) => b.q === q.prompt);
		const right = rnd() < skill - (q.difficulty - 2) * 0.12;
		let wrong = '7';
		if (q.options) wrong = String((Number(src.a) + 1) % q.options.length);
		const r = await call('POST', `/api/session/${st.session.id}/answer`, {
			question_id: q.id, given: right ? src.a : wrong, time_ms: 25000 + rnd() * 150000,
		});
		if (!r.correct) await call('POST', `/api/attempt/${r.attempt_id}/mistake`, { type: ['careless', 'careless', 'method', 'misread', 'guess'][Math.floor(rnd() * 5)] });
	}
	const away = rnd() < 0.3 ? Math.round(30 + rnd() * 200) : 0;
	const awayCount = away ? 1 + Math.floor(rnd() * 3) : 0;
	await call('POST', `/api/session/${st.session.id}/finish`, { away_s: away, away_count: awayCount });
	// shift this session into the past
	const shift = (iso) => {
		const d = new Date(iso);
		d.setUTCDate(d.getUTCDate() - daysAgo);
		d.setUTCHours(hour - 5, 30 + Math.floor(rnd() * 25));
		return d.toISOString();
	};
	const s = db.prepare('SELECT * FROM sessions WHERE id=?').get(st.session.id);
	const start = shift(s.started_at); const
		end = new Date(new Date(start).getTime() + st.questions.length * (60 + rnd() * 90) * 1000).toISOString();
	db.prepare('UPDATE sessions SET started_at=?, ended_at=?, duration_s=? WHERE id=?').run(start, end, Math.round((new Date(end) - new Date(start)) / 1000), s.id);
	db.prepare('UPDATE attempts SET created_at=? WHERE session_id=?').run(end, s.id);
	db.prepare('UPDATE events SET created_at=? WHERE session_id=?').run(end, s.id);
}

// Week 1 (set as current week 2 afterwards)
const plan = [
	[12, 18, 'diagnostic', 1, 0.8], [11, 19, 'practice', 1, 0.85], [10, 19, 'practice', 1, 0.8], [9, 18, 'puzzle', 1, 0.6],
	[8, 19, 'practice', 1, 0.85], [7, 7, 'revision', 1, 0.7], [6, 10, 'before', 2, 0.45], [6, 11, 'practice', 2, 0.6],
	[5, 19, 'practice', 2, 0.65], [4, 19, 'practice', 2, 0.7], [3, 18, 'puzzle', 2, 0.65], [2, 19, 'practice', 2, 0.75],
	[1, 19, 'revision', 2, 0.8], [0, 10, 'after', 2, 0.85],
];
for (const [ago, h, kind, wk, skill] of plan) await playSession(kind, wk, skill, ago, h);
db.prepare('UPDATE badges SET earned_at=(SELECT MAX(ended_at) FROM sessions)').run();
db.prepare('INSERT INTO messages(body, created_at, seen_at, reaction) VALUES (?, ?, ?, ?)').run("Superb diagnostic, champ! Fractions week starts Saturday — let's smash it.", new Date(Date.now() - 6 * 864e5).toISOString(), new Date(Date.now() - 6 * 864e5 + 3600e3).toISOString(), 'High five');
db.prepare("UPDATE settings SET value='2' WHERE key='week_override'").run();
db.prepare("UPDATE settings SET value='Champ' WHERE key='player_name'").run();
console.log('demo data ready:', db.prepare('SELECT COUNT(*) n, SUM(runs) r FROM sessions').get());
