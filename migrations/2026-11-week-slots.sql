-- Migration: weekly mission slots (parent publishes a week; each mission opens on its day).
-- Run once against an existing database BEFORE deploying the matching code:
--   npx wrangler d1 execute brickfield-db --remote --file=migrations/2026-11-week-slots.sql
-- The ALTER fails if sessions.slot already exists (it means this was already run).
-- After deploying, publish the current week in the parent dashboard (Week plan tab); until then the kid cannot start any mission.

ALTER TABLE sessions ADD COLUMN slot TEXT;
CREATE TABLE IF NOT EXISTS week_slots (
  week         INTEGER NOT NULL,
  slot         TEXT    NOT NULL,
  day          TEXT    NOT NULL,
  published_at TEXT    NOT NULL,
  PRIMARY KEY (week, slot)
);
