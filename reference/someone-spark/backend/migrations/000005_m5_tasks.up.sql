CREATE TABLE spark_tasks (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(26) NOT NULL,
  user_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  friend_id BIGINT NOT NULL,
  body TEXT NOT NULL,
  sticker_key VARCHAR(64) NOT NULL DEFAULT '',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_enqueued_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_task_public (public_id),
  UNIQUE KEY uk_task_account_friend (account_id, friend_id),
  KEY idx_task_user (user_id),
  CONSTRAINT fk_task_account FOREIGN KEY (account_id) REFERENCES douyin_accounts(id),
  CONSTRAINT fk_task_friend FOREIGN KEY (friend_id) REFERENCES friends(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE douyin_accounts
  ADD COLUMN risk_until DATETIME NULL,
  ADD COLUMN consecutive_fails INT NOT NULL DEFAULT 0,
  ADD COLUMN next_task_at DATETIME NULL;

ALTER TABLE send_jobs
  ADD COLUMN dry_run TINYINT(1) NOT NULL DEFAULT 0 AFTER kind;
