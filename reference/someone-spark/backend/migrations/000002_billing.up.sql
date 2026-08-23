CREATE TABLE card_batches (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(26) NOT NULL,
  kind ENUM('balance','plan') NOT NULL,
  plan_id BIGINT NULL,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  quantity INT NOT NULL,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  created_by BIGINT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_card_batches_public (public_id),
  CONSTRAINT fk_card_batches_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE card_keys (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id BIGINT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  kind ENUM('balance','plan') NOT NULL,
  plan_id BIGINT NULL,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  status ENUM('unused','used') NOT NULL DEFAULT 'unused',
  used_by BIGINT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_card_keys_hash (code_hash),
  KEY idx_card_keys_batch (batch_id),
  CONSTRAINT fk_card_keys_batch FOREIGN KEY (batch_id) REFERENCES card_batches(id),
  CONSTRAINT fk_card_keys_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE balance_ledgers (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type ENUM('purchase_slot','purchase_plan','redeem_balance','redeem_plan','admin_adjust') NOT NULL,
  delta_cents BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  KEY idx_ledgers_user (user_id, id),
  CONSTRAINT fk_ledgers_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
