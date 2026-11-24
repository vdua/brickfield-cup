-- Migration: per-worksheet difficulty -> runs table (NULL = use the global table).
-- Run once against an existing database BEFORE deploying the matching code:
--   npx wrangler d1 execute brickfield-db --remote --file=migrations/2026-11-worksheet-runs-table.sql
-- The ALTER fails if the column already exists (it means this was already run).
ALTER TABLE worksheets ADD COLUMN runs_table TEXT;
