-- Replay (revision) sessions no longer pay runs. Zero out runs already paid by them.
-- Scores (correct counts) are kept; only runs change. Safe to repeat.
UPDATE attempts SET runs = 0 WHERE session_id IN (SELECT id FROM sessions WHERE kind = 'revision') AND runs <> 0;
UPDATE sessions SET runs = 0 WHERE kind = 'revision' AND runs <> 0;
