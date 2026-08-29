-- Existing conversation projections predate the default-maintenance rule.
-- Apply it once; later sync upserts intentionally preserve the user's choice.
UPDATE friends
SET spark_enabled = true,
    updated_at = now()
WHERE deleted_at IS NULL
  AND has_conversation = true
  AND streak_days > 0
  AND spark_enabled = false;
