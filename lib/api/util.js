// Shared time, response and D1 helpers.
export const IST_MS = 330 * 60 * 1000;
export const nowIso = () => new Date().toISOString();
export const istDay = (iso) => new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);
export const istHour = (iso) => new Date(new Date(iso).getTime() + IST_MS).getUTCHours();

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
export const fail = (status, error) => json({ error }, status);

export const all = async (db, sql, ...b) => (await db.prepare(sql).bind(...b).all()).results || [];
export const one = (db, sql, ...b) => db.prepare(sql).bind(...b).first();
export const run = (db, sql, ...b) => db.prepare(sql).bind(...b).run();
