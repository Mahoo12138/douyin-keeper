-- Conversation rows no longer carry a consumer/creator channel. The
-- platform conversation ID is the sole conversation identity and routing key.
ALTER TABLE conversations DROP COLUMN IF EXISTS channel;
