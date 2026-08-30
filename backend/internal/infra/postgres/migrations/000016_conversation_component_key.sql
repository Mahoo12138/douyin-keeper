-- The virtual conversation row's React Fiber key is correlated with
-- get_info_list field 6.610.1.1 before a snapshot item is accepted. Keep the
-- canonical key so later crawls can identify the same rendered item without
-- relying on a mutable title or virtual-list data-index.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS platform_component_key TEXT;

-- Existing rows were created from the same response conversation identifier.
-- Backfill them so the new invariant applies without discarding prior state.
UPDATE conversations
SET platform_component_key = platform_conversation_id
WHERE platform_component_key IS NULL OR platform_component_key = '';

ALTER TABLE conversations
  ALTER COLUMN platform_component_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_account_component_key
  ON conversations(account_id, platform_component_key);
