ALTER TABLE conversations ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX ix_conversations_active
  ON conversations(account_id, updated_at DESC)
  WHERE archived_at IS NULL;
