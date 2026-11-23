-- Brickfield Cup — Cloudflare D1 schema
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  week       INTEGER NOT NULL DEFAULT 0,          -- 0 = any week
  kind       TEXT    NOT NULL,                    -- practice | before | after | puzzle | diagnostic | mock
  topic      TEXT    NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 2,          -- 1 easy, 2 medium, 3 hard
  prompt     TEXT    NOT NULL,
  answer     TEXT    NOT NULL,                    -- for multiple choice: index of the right option
  options    TEXT,                                -- JSON array for multiple choice, else NULL
  method     TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_q_kind_week ON questions(kind, week, active);

CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT    NOT NULL,
  week         INTEGER NOT NULL,
  question_ids TEXT    NOT NULL,                  -- JSON array
  started_at   TEXT    NOT NULL,
  ended_at     TEXT,
  score        INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  runs         INTEGER NOT NULL DEFAULT 0,
  wickets      INTEGER NOT NULL DEFAULT 0,
  duration_s   INTEGER NOT NULL DEFAULT 0,
  away_s       INTEGER NOT NULL DEFAULT 0,        -- seconds the tab was hidden during the session
  away_count   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_s_week ON sessions(week, kind);
CREATE INDEX IF NOT EXISTS idx_s_ended ON sessions(ended_at);

CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  given       TEXT,
  correct     INTEGER NOT NULL,
  time_ms     INTEGER NOT NULL DEFAULT 0,
  runs        INTEGER NOT NULL DEFAULT 0,
  mistake     TEXT,                               -- careless | method | misread | guess
  created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a_session ON attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_a_question ON attempts(question_id, correct);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,
  detail     TEXT,
  session_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_e_created ON events(created_at);

CREATE TABLE IF NOT EXISTS badges (
  code      TEXT PRIMARY KEY,
  earned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rewards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  cost         INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'available',  -- available | requested | approved | archived
  requested_at TEXT,
  approved_at  TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seen_at    TEXT,
  reaction   TEXT
);

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('player_name', 'Champ'),
  ('team_name', 'Bellandur Brickers'),
  ('start_date', '2026-11-23'),
  ('week_override', '0'),
  ('daily_goal_min', '30');

INSERT INTO rewards(title, cost)
  SELECT 'Extra 30 min cricket on Sunday', 300 WHERE NOT EXISTS (SELECT 1 FROM rewards);
INSERT INTO rewards(title, cost)
  SELECT 'Pick the weekend dinner', 500 WHERE (SELECT COUNT(*) FROM rewards) = 1;
INSERT INTO rewards(title, cost)
  SELECT 'New brick set', 1500 WHERE (SELECT COUNT(*) FROM rewards) = 2;
