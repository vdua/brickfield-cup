// Local test server (no Cloudflare needed): node test/dev-server.mjs
// Uses Node's built-in SQLite as a stand-in for D1. For real deploys use `npx wrangler pages dev`.
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../lib/api.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.db, this.sql, a); }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }
}
export class FakeD1 {
  constructor(file = ":memory:") { this.db = new DatabaseSync(file); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; }
  exec(sql) { this.db.exec(sql); }
}

export function makeEnv(file = ":memory:") {
  const DB = new FakeD1(file);
  DB.exec(readFileSync(join(root, "schema.sql"), "utf8"));
  if (DB.db.prepare("SELECT COUNT(*) n FROM questions").get().n === 0) DB.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  return { DB, SESSION_SECRET: "dev-secret-change-me", KID_PIN: "1234", PARENT_PIN: "9999" };
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".json": "application/json" };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = makeEnv(process.env.DB_FILE || join(root, "test/local.sqlite"));
  const port = Number(process.env.PORT || 8788);
  createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith("/api/")) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const r = await handle(request, env).catch((e) => new Response(JSON.stringify({ error: e.message }), { status: 500 }));
      const headers = Object.fromEntries(r.headers); res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let file = join(root, "public", decodeURIComponent(url.pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) && existsSync(file + ".html")) file += ".html";
    if (!existsSync(file)) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  }).listen(port, () => console.log(`Brickfield Cup on http://localhost:${port}  (kid PIN 1234, parent PIN 9999)`));
}
