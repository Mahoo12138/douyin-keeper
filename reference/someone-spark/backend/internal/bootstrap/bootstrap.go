package bootstrap

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"

	"huohua/internal/config"
	"huohua/internal/id"
	"huohua/internal/password"
)

func Admin(ctx context.Context, db *sql.DB, cfg *config.Config) error {
	email := strings.ToLower(strings.TrimSpace(cfg.BootstrapAdminEmail))
	if email == "" || cfg.BootstrapAdminPassword == "" {
		return nil
	}
	var n int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	hash, err := password.Hash(cfg.BootstrapAdminPassword)
	if err != nil {
		return fmt.Errorf("超管密码不符合规则: %w", err)
	}
	_, err = db.ExecContext(ctx, `
		INSERT INTO users (public_id, email, password_hash, role, status, balance_cents, slot_quota, created_at, updated_at)
		VALUES (?, ?, ?, 'admin', 'active', 0, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`, id.New(), email, hash)
	if err != nil {
		return err
	}
	slog.Info("已创建初始管理员", "email", email)
	return nil
}
