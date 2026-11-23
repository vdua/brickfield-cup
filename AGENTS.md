# AGENTS.md

Brickfield Cup: SASMO maths-prep app on Cloudflare Pages + Pages Functions (Workers) + D1. Plain JS (ESM), no build step, no framework.

Docs live behind [docs/catalog.md](docs/catalog.md). Check it before searching the repo, and add new docs to it.

## Code organisation
- Max **300 lines per `.js`/`.mjs` file**. Split before you cross it.
- Keep code modular: tightly coupled code lives together in its own file or directory (e.g. one module per API area, not one giant handler). Don't scatter one concern across unrelated files.
- Layout: `lib/api/` is the API split by concern (`routes-kid.js`, `routes-parent.js`, `auth.js`, `stats.js`, ...) behind the stable entry `lib/api.js`. `public/js/kid/` and `public/js/parent/` hold one module per screen; shared UI state lives in each folder's `state.js` as a `ctx` object (never a re-assigned `let` export).
- Shared logic goes in `lib/`. `public/js/` is browser-only; `functions/` stays a thin adapter over `lib/`.

## Working on the repo
- Install: `npm install`
- Test: `npm test` (end-to-end API tests against Node's built-in SQLite via `test/dev-server.mjs`). Run before finishing any change to `lib/` or `functions/`.
- Dev (real Workers runtime): `cp .dev.vars.example .dev.vars`, init local D1 with `npm run db:init:local`, then `npm run dev` (http://localhost:8788).
- Dev (no wrangler): `npm run dev:node` (kid PIN 1234, parent PIN 9999); `node test/demo-data.mjs` fills it with fake play.
- Lint: `npm run lint`, `npm run lint:fix` (airbnb-base + Cloudflare style, see `.eslintrc.cjs`).
- Never run `db:init:remote` or `deploy` unless asked; they touch production.

## Generated vs hand-edited
- **Generated, do not edit:** `seed.sql` (run `npm run seed:build` after changing `data/questions.json`), `package-lock.json`, `.wrangler/`, `test/local.sqlite`.
- **Source of truth for questions:** `data/questions.json`.
- **Hand-edited:** everything else, including `schema.sql`. A schema change needs a matching update to `lib/` and the tests.
- `.dev.vars` and secrets are never committed; only `.dev.vars.example`.

## Workers constraints
- `lib/` and `functions/` run in the Workers runtime: no Node built-ins (`fs`, `path`, `node:*`), no `process`, no native modules. Use Web APIs (`fetch`, `Request`/`Response`, `crypto.subtle`, `URL`).
- Node-only code belongs in `scripts/` and `test/` only. Never import from them into `lib/` or `functions/`.
- Database is D1 via the `env.DB` binding; the Node test server must keep emulating that interface.
- Config comes from `env` (`SESSION_SECRET`, `KID_PIN`, `PARENT_PIN`), never from globals or files.
- Free-tier limits apply: keep requests short, avoid unbounded queries, batch D1 writes.

## Git workflow
- Never commit directly to `main`. Create a branch, push it, and raise a PR to `main`.
