-- The message panel is authoritative: every stable platform conversation ID
-- is a separate row, even when multiple rows resolve to the same peer.
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_account_id_friend_id_channel_key;
