CREATE TABLE notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('info','warning','critical')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  dedupe_key TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX ux_notifications_user_dedupe
  ON notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX ix_notifications_user_created
  ON notifications(user_id, created_at DESC);
CREATE INDEX ix_notifications_user_unread
  ON notifications(user_id, read_at)
  WHERE read_at IS NULL;
