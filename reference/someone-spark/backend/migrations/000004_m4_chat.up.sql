CREATE TABLE friends (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(26) NOT NULL,
  account_id BIGINT NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  nickname VARCHAR(128) NOT NULL DEFAULT '',
  short_id VARCHAR(64) NOT NULL DEFAULT '',
  avatar_url VARCHAR(512) NOT NULL DEFAULT '',
  streak_days INT NOT NULL DEFAULT 0,
  has_conversation TINYINT(1) NOT NULL DEFAULT 0,
  spark_enabled TINYINT(1) NOT NULL DEFAULT 1,
  allow_first_message TINYINT(1) NULL,
  last_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_friend_public (public_id),
  UNIQUE KEY uk_friend_account_name (account_id, display_name),
  KEY idx_friend_account (account_id),
  CONSTRAINT fk_friend_account FOREIGN KEY (account_id) REFERENCES douyin_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stickers_cache (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  sticker_key VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL DEFAULT '',
  preview_url VARCHAR(512) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_sticker_acc_key (account_id, sticker_key),
  CONSTRAINT fk_sticker_account FOREIGN KEY (account_id) REFERENCES douyin_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE media_objects (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  object_key VARCHAR(512) NOT NULL,
  sha256 CHAR(64) NOT NULL DEFAULT '',
  content_type VARCHAR(128) NOT NULL DEFAULT '',
  byte_size BIGINT NOT NULL DEFAULT 0,
  source_url VARCHAR(1024) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_media_key (object_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE send_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(26) NOT NULL,
  user_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  friend_id BIGINT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT '',
  kind VARCHAR(16) NOT NULL DEFAULT 'text',
  body TEXT NOT NULL,
  status ENUM('queued','ok','fail') NOT NULL DEFAULT 'queued',
  error_code VARCHAR(64) NOT NULL DEFAULT '',
  platform_msg_id VARCHAR(128) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  UNIQUE KEY uk_send_public (public_id),
  KEY idx_send_created (created_at, status),
  KEY idx_send_account (account_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE send_uniques (
  account_id BIGINT NOT NULL,
  friend_id BIGINT NOT NULL,
  local_date CHAR(10) NOT NULL,
  send_job_id BIGINT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (account_id, friend_id, local_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_send_counters (
  account_id BIGINT NOT NULL,
  local_date CHAR(10) NOT NULL,
  sent_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, local_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_first_message_counters (
  account_id BIGINT NOT NULL,
  local_date CHAR(10) NOT NULL,
  sent_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, local_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE chat_messages
  ADD UNIQUE KEY uk_chat_platform (account_id, platform_msg_id),
  ADD UNIQUE KEY uk_chat_dedup (account_id, friend_id, direction, body_hash, time_bucket);
