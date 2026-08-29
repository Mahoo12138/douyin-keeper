-- Today's flame state belongs to the rendered conversation row, not to the
-- reusable peer projection. NULL means the platform icon was not recognized.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS streak_activated_today BOOLEAN;
