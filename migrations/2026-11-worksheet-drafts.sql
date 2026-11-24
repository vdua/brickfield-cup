-- Migration: worksheet drafts (answers saved while a worksheet session is still open).
-- Run once against an existing database BEFORE deploying the matching code:
--   npx wrangler d1 execute brickfield-db --remote --file=migrations/2026-11-worksheet-drafts.sql
-- Safe to repeat.
CREATE TABLE IF NOT EXISTS worksheet_drafts (
  session_id INTEGER PRIMARY KEY,
  answers    TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
