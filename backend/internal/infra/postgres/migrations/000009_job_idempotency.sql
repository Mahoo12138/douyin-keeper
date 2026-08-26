ALTER TABLE jobs
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN idempotency_scope TEXT;

CREATE UNIQUE INDEX ux_jobs_user_idempotency_key
  ON jobs(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
