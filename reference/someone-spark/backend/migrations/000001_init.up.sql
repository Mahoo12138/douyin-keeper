CREATE TABLE users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(26) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  balance_cents BIGINT NOT NULL DEFAULT 0,
  email_verified_at DATETIME NULL,
  slot_quota INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_users_public_id (public_id),
  UNIQUE KEY uk_users_email (email),
  CONSTRAINT chk_users_balance CHECK (balance_cents >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  csrf_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_codes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  purpose ENUM('register','reset') NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY idx_email_codes_lookup (email, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plans (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  duration_days INT NOT NULL,
  price_cents BIGINT NOT NULL,
  daily_send_limit INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriptions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('active','expired','cancelled') NOT NULL,
  source ENUM('purchase','redeem','admin','trial') NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_sub_user_status (user_id, status, ends_at),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE douyin_accounts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  public_id CHAR(26) NOT NULL,
  douyin_uid VARCHAR(64) NULL,
  nickname VARCHAR(128) NULL,
  avatar_url VARCHAR(512) NULL,
  session_blob BLOB NULL,
  session_status ENUM('valid','expired','unknown','unbound') NOT NULL DEFAULT 'unbound',
  phone_cipher BLOB NULL,
  prefer_protocol TINYINT(1) NOT NULL DEFAULT 1,
  allow_first_message TINYINT(1) NOT NULL DEFAULT 0,
  risk_status VARCHAR(32) NOT NULL DEFAULT '',
  risk_reason VARCHAR(255) NOT NULL DEFAULT '',
  slot_status ENUM('active','released') NOT NULL DEFAULT 'active',
  last_sync_at DATETIME NULL,
  last_login_check_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_dy_public (public_id),
  KEY idx_dy_user (user_id),
  UNIQUE KEY uk_dy_user_uid (user_id, douyin_uid),
  CONSTRAINT fk_dy_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE site_settings (
  k VARCHAR(128) NOT NULL PRIMARY KEY,
  v TEXT NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT NULL,
  event VARCHAR(64) NOT NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  meta_json JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_audit_event_time (event, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO plans (code, name, duration_days, price_cents, daily_send_limit, is_active) VALUES
  ('trial', '体验卡', 0, 0, NULL, 1),
  ('weekly', '周卡', 7, 1900, NULL, 1),
  ('monthly', '月卡', 31, 4900, NULL, 1),
  ('quarterly', '季卡', 93, 12900, NULL, 1),
  ('yearly', '年卡', 366, 39900, NULL, 1);

INSERT INTO site_settings (k, v, updated_at) VALUES
  ('site.name', '火花', UTC_TIMESTAMP()),
  ('site.notice', '', UTC_TIMESTAMP()),
  ('site.maintenance', '0', UTC_TIMESTAMP()),
  ('register.enabled', '1', UTC_TIMESTAMP()),
  ('register.trial_days', '0', UTC_TIMESTAMP()),
  ('seo.title', '火花 — 每天自动给好友续上火花', UTC_TIMESTAMP()),
  ('seo.description', '定时给抖音好友续火花。网页管理，多号共享一份套餐，卡密开通。', UTC_TIMESTAMP()),
  ('billing.add_account_price_cents', '3000', UTC_TIMESTAMP()),
  ('douyin.max_accounts_per_user', '10', UTC_TIMESTAMP()),
  ('send.protocol_enabled', '1', UTC_TIMESTAMP()),
  ('send.first_message_daily_limit', '5', UTC_TIMESTAMP()),
  ('send.hard_daily_cap', '20', UTC_TIMESTAMP()),
  ('send.quiet_start', '00:00', UTC_TIMESTAMP()),
  ('send.quiet_end', '07:00', UTC_TIMESTAMP()),
  ('worker.max_browsers', '2', UTC_TIMESTAMP());
