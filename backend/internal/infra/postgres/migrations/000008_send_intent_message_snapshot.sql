ALTER TABLE send_intents
  ADD COLUMN message_kind TEXT,
  ADD COLUMN message_body TEXT;

ALTER TABLE send_intents
  ADD CONSTRAINT send_intents_message_kind_check
  CHECK (message_kind IS NULL OR message_kind IN ('text', 'sticker'));

UPDATE send_intents si
SET message_kind = t.message_kind,
    message_body = t.message_body
FROM spark_tasks t
WHERE t.id = si.task_id;

CREATE INDEX ix_send_intents_message_snapshot
  ON send_intents(account_id, created_at DESC)
  WHERE message_kind IS NOT NULL;
