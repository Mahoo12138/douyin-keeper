CREATE TABLE message_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text','sticker')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CHECK (char_length(body) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX ux_message_template_user_name
  ON message_templates(user_id, name) WHERE deleted_at IS NULL;
CREATE INDEX ix_message_template_user_updated
  ON message_templates(user_id, updated_at DESC) WHERE deleted_at IS NULL;
