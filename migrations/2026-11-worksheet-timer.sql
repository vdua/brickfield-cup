-- Migration: worksheet mode, time limit and the late flag.
-- Run once against an existing database BEFORE deploying the matching code:
--   npx wrangler d1 execute brickfield-db --remote --file=migrations/2026-11-worksheet-timer.sql
-- The ALTERs fail if a column already exists (it means this was already run).
ALTER TABLE worksheets ADD COLUMN mode TEXT NOT NULL DEFAULT 'screen';
ALTER TABLE worksheets ADD COLUMN time_limit_min INTEGER;
ALTER TABLE sessions ADD COLUMN late INTEGER NOT NULL DEFAULT 0;
