-- Conversations are platform routing records. A conversation may be a group
-- or a direct chat with a non-friend, so friend membership must not be a
-- prerequisite for indexing it.
ALTER TABLE conversations
  ALTER COLUMN friend_id DROP NOT NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'direct'
    CHECK (conversation_type IN ('direct', 'group', 'unknown'));

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS peer_platform_user_id TEXT;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS peer_display_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS ix_conversations_account_type
  ON conversations(account_id, conversation_type, updated_at DESC);
