// Brickfield Cup API — runs as a Cloudflare Pages Function (a Worker) with a D1 binding named DB.
import { json, fail } from "./util.js";
import { readRole } from "./auth.js";
import { publicRoutes, kidRoutes } from "./routes-kid.js";
import { parentRoutes } from "./routes-parent.js";

export { isCorrect } from "./answers.js";

export async function handle(request, env) {
  if (!env.DB) return fail(500, "D1 binding 'DB' is missing — see README.");
  if (!env.SESSION_SECRET) return fail(500, "SESSION_SECRET is not set — see README.");
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const method = request.method;
  const body = method === "GET" || method === "DELETE" ? {} : await request.json().catch(() => ({}));
  const seg = path.split("/").filter(Boolean);
  const secure = url.protocol === "https:";

  const ctx = { request, env, db, url, path, method, body, seg, secure };
  const pub = await publicRoutes(ctx);
  if (pub) return pub;

  const role = await readRole(request, env);
  if (!role) return fail(401, "Please log in");
  if (path === "/me") return json({ role });

  const kid = await kidRoutes(ctx);
  if (kid) return kid;

  if (seg[0] !== "parent") return fail(404, "Not found");
  if (role !== "parent") return fail(403, "Parents only");
  return (await parentRoutes(ctx)) || fail(404, "Not found");
}
