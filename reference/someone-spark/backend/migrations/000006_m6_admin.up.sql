INSERT INTO site_settings (k, v, updated_at) VALUES
  ('send.daily_limit', '20', UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE k = k;

CREATE TABLE chat_review_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT NOT NULL,
  message_id BIGINT NULL,
  event VARCHAR(32) NOT NULL,
  filter_json JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_review_actor_time (actor_user_id, created_at),
  KEY idx_review_msg (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
