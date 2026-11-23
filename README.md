# The Brickfield Cup — SASMO prep platform

A personal maths-olympiad practice game for a Grade 5 student, with a parent dashboard to track progress.
It runs entirely on Cloudflare's free tier:

- **Cloudflare Pages** serves the app (`public/`)
- **Pages Functions** (Cloudflare Workers) run the API (`functions/api/[[path]].js` → `lib/api.js`)
- **D1** (Cloudflare's SQLite database) stores questions, sessions, every answer, events, badges, rewards and messages

## What's inside

**For him (`/kid`)**: every question is a ball he faces. Correct answers score 2, 4 or 6 runs depending on difficulty; a wrong answer is a wicket.
- His runs build a stadium in 7 stages (pitch → pavilion → stands → floodlights → scoreboard → trophy room).
- Each week is a "match" with 5 tasks: **Toss** (before-check), **Nets** ×4 (practice), **Spin puzzle**, **Replay** (questions he got wrong before) and **Final over** (after-check). In Week 1 the toss is the 20-question diagnostic.
- **Careless-mistake guard:** a very quick answer to a medium or hard question gets one "Re-read the question?" prompt first.
- **Honest review:** after every wrong answer he tags why (silly slip / didn't know how / misread / guessed). This feeds your dashboard.
- 13 badges, a daily-goal ring, a partnership streak, a 19-week "road to SASMO", messages from Dad with reactions, and a reward shop where he spends runs (you approve).
- Sounds and brick confetti. All art can be replaced with Firefly images (see **ASSETS.md**).

**For you (`/parent`)**
- **Overview:** a summary line, KPIs, the 19-week tracker (before → after gain, practice %, mock score, careless slips, minutes), topic mastery ranked weakest first with a "focus next" note, a daily-minutes chart (including time the app was in the background), and a breakdown of why answers were wrong.
- **Activity:** a timeline of everything he did: logins, app opens, sessions started and finished, retiring early, switching away mid-question.
- **Sessions:** every question in every session, with his answer, the right answer, time taken and his reason for any miss.
- **Error notebook:** all wrong answers, filterable by reason, topic and fixed/not fixed. Printable for weekend review.
- **Question bank:** add, edit or remove questions, or bulk-import JSON.
- **Messages & rewards:** send messages, add rewards, approve requests.
- **Settings:** his name, team name, plan start date, week override, daily goal.

The question bank starts with 106 questions: the Week 1 diagnostic, Weeks 1–5 practice, before/after checks for Weeks 2–5, and 10 puzzles. Add later weeks as you go (see "Adding questions").

## Deploy (about 15 minutes)

You need a free Cloudflare account and Node.js 18+.

```bash
cd brickfield-cup
npm install                          # installs wrangler
npx wrangler login                   # opens the browser to sign in to Cloudflare

# 1. Create the database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create brickfield-db

# 2. Create tables and load the question bank
npm run db:init:remote

# 3. Create the Pages project and deploy
npx wrangler pages project create brickfield-cup --production-branch main
npm run deploy

# 4. Set the secrets (each command asks you for the value)
npx wrangler pages secret put SESSION_SECRET --project-name brickfield-cup   # any long random string
npx wrangler pages secret put KID_PIN        --project-name brickfield-cup   # e.g. 4 digits he'll remember
npx wrangler pages secret put PARENT_PIN     --project-name brickfield-cup   # a different, longer PIN

# 5. Deploy once more so the secrets take effect
npm run deploy
```

Open the `https://brickfield-cup.pages.dev` URL that it prints. Log in as Parent first, then go to **Settings** to set his name and team name.

> If the D1 binding doesn't show up: Cloudflare dashboard → Workers & Pages → brickfield-cup → Settings → Bindings → add a D1 binding named `DB` pointing to `brickfield-db`, then redeploy.

### Custom domain (optional)
Cloudflare dashboard → your Pages project → Custom domains. For example, `cup.yourdomain.in`.

## Run it locally

```bash
cp .dev.vars.example .dev.vars
npx wrangler d1 execute brickfield-db --local --file=schema.sql
npx wrangler d1 execute brickfield-db --local --file=seed.sql
npm run dev            # http://localhost:8788  (PINs from .dev.vars)
```

There's also a zero-install test server that uses Node's built-in SQLite: `node test/dev-server.mjs` (kid PIN 1234, parent PIN 9999). `node test/demo-data.mjs` fills it with 2 weeks of fake play so you can see the dashboards populated. `npm test` runs the API end-to-end tests.

## Adding questions

- **One at a time:** Parent → Question bank → form.
- **A whole week at once:** Parent → Question bank → Bulk import. Paste JSON like this:

```json
[
  {"week": 7, "kind": "before", "topic": "Percentage", "difficulty": 1, "prompt": "What is 15% of 80?", "answer": "12", "method": "10% is 8, 5% is 4."},
  {"week": 7, "kind": "practice", "topic": "Percentage", "difficulty": 2, "prompt": "Which is bigger?", "options": ["30% of 50", "50% of 30", "They are equal"], "answer": "2", "method": "Both are 15."}
]
```

Kinds: `before` and `after` (6 each per week: the Saturday and Sunday checks), `practice` (4 are picked at random per session, three sessions Mon–Wed, preferring ones he hasn't got right), `puzzle` (6 per Thursday session; week-specific first, then week 0 "any week"), `mock` (all mock questions for that week are used; with none, 20 random past questions are used), `diagnostic` (the original 20-question baseline, no longer a weekly mission). See `docs/sessions-and-missions.md`.
For multiple choice, `answer` is the option number counting from 0. Typed answers are checked as numbers, so `3/8`, `0.375`, `4 1/6`, `₹120` and `3.5 hours` all work.

To change the starter bank, edit `data/questions.json`, run `npm run seed:build`, then load `seed.sql`. It is safe to re-run: it only inserts questions whose kind, week and prompt aren't already in the bank (an edited prompt counts as new, so it would be re-added).

## Backups

```bash
npx wrangler d1 export brickfield-db --remote --output=backup-$(date +%F).sql
```

## Security notes
- PINs are light protection, suited to a family app. Wrong PINs are rate-limited (8 tries per 15 minutes). Sessions use HMAC-signed, HttpOnly cookies.
- For stronger protection, put the site behind **Cloudflare Access** (free for up to 50 users): Zero Trust → Access → Applications, and allow only your family's email addresses.
- The parent PIN unlocks the dashboard and the question bank, so keep it different from his.

## Project layout
```
public/            static site (index = player login, parent-login.html, kid.html, parent.html, css/, js/, assets/)
functions/api/     Pages Function entry (catch-all /api/*)
lib/api.js         API: auth, sessions, scoring, badges, parent endpoints
lib/content.js     19-week roadmap, weekly mission, badges, stadium stages; edit freely
schema.sql         D1 tables + default settings and rewards
data/questions.json → seed.sql (via scripts/build-seed.mjs)
test/              local dev server, demo data, API tests
ASSETS.md          Firefly prompts and file names for all artwork
```
