package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

type NotificationRepo struct {
	pool *pgxpool.Pool
}

func NewNotificationRepo(pool *pgxpool.Pool) *NotificationRepo {
	return &NotificationRepo{pool: pool}
}

func (r *NotificationRepo) List(ctx context.Context, userID int64, filter notification.ListFilter) ([]*notification.Notification, int, error) {
	var unreadCount int
	if err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM notifications
		WHERE user_id=$1 AND read_at IS NULL
		  AND (expires_at IS NULL OR expires_at > now())`, userID).Scan(&unreadCount); err != nil {
		return nil, 0, err
	}

	query := `
		SELECT id, public_id, user_id, type, priority, title, body,
		       resource_type, resource_id, dedupe_key, read_at, created_at, expires_at
		FROM notifications
		WHERE user_id=$1 AND (expires_at IS NULL OR expires_at > now())`
	args := []any{userID}
	if filter.UnreadOnly {
		query += ` AND read_at IS NULL`
	}
	query += ` ORDER BY created_at DESC, id DESC LIMIT $2`
	args = append(args, filter.Limit)

	rows, err := From(ctx, r.pool).Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]*notification.Notification, 0)
	for rows.Next() {
		item := new(notification.Notification)
		if err := rows.Scan(&item.ID, &item.PublicID, &item.UserID, &item.Type, &item.Priority,
			&item.Title, &item.Body, &item.ResourceType, &item.ResourceID, &item.DedupeKey,
			&item.ReadAt, &item.CreatedAt, &item.ExpiresAt); err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return items, unreadCount, nil
}

func (r *NotificationRepo) MarkRead(ctx context.Context, userID int64, publicID uuid.UUID) (bool, error) {
	tag, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE notifications
		SET read_at=COALESCE(read_at, now())
		WHERE user_id=$1 AND public_id=$2`, userID, publicID)
	return tag.RowsAffected() > 0, err
}

func (r *NotificationRepo) MarkAllRead(ctx context.Context, userID int64) (int, error) {
	tag, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE notifications SET read_at=now()
		WHERE user_id=$1 AND read_at IS NULL`, userID)
	return int(tag.RowsAffected()), err
}

func (r *NotificationRepo) Create(ctx context.Context, item *notification.Notification) error {
	if item.PublicID == uuid.Nil {
		item.PublicID = uuid.New()
	}
	createdAt := item.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now()
	}
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO notifications
			(public_id, user_id, type, priority, title, body, resource_type, resource_id, dedupe_key, created_at, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),$10,$11)
		ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
		item.PublicID, item.UserID, item.Type, item.Priority, item.Title, item.Body,
		item.ResourceType, item.ResourceID, item.DedupeKey, createdAt, item.ExpiresAt)
	return err
}

func (r *NotificationRepo) NotifyRisk(ctx context.Context, accountID int64, code, severity string, createdAt time.Time) error {
	if severity == string(notification.PriorityInfo) {
		return nil
	}
	var publicID uuid.UUID
	var userID int64
	var nickname string
	if err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT public_id, user_id, nickname
		FROM douyin_accounts
		WHERE id=$1 AND deleted_at IS NULL`, accountID).Scan(&publicID, &userID, &nickname); err != nil {
		return err
	}

	title, body := riskCopy(code, nickname)
	priority := notification.PriorityWarning
	if code == "SESSION_EXPIRED" || code == "ADAPTER_INCOMPATIBLE" || code == "BROWSER_SELECTOR_CHANGED" {
		priority = notification.PriorityCritical
	}
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return err
	}
	item := &notification.Notification{
		UserID: userID, Type: notification.TypeRiskEvent, Priority: priority,
		Title: title, Body: body, ResourceType: stringPtr("account"),
		ResourceID: stringPtr(publicID.String()),
		DedupeKey:  fmt.Sprintf("risk:%d:%s:%s", accountID, code, createdAt.In(loc).Format("2006-01-02")),
		CreatedAt:  createdAt,
	}
	return r.Create(ctx, item)
}

func riskCopy(code, nickname string) (string, string) {
	name := nickname
	if name == "" {
		name = "抖音账号"
	}
	switch code {
	case "SESSION_EXPIRED":
		return "抖音账号登录已失效", fmt.Sprintf("账号「%s」需要重新登录后才能继续执行任务。", name)
	case "CHALLENGE_REQUIRED":
		return "账号需要完成安全验证", fmt.Sprintf("账号「%s」触发了平台安全验证，请完成验证后再继续。", name)
	case "PLATFORM_RATE_LIMITED":
		return "账号触发平台限流", fmt.Sprintf("账号「%s」已进入冷却，系统会在冷却结束后再尝试。", name)
	case "ADAPTER_INCOMPATIBLE", "UNSUPPORTED_PROTOCOL_VERSION":
		return "发送通道暂不可用", fmt.Sprintf("账号「%s」的发送通道版本不兼容，已停止本次执行。", name)
	case "BROWSER_SELECTOR_CHANGED":
		return "浏览器能力需要维护", fmt.Sprintf("账号「%s」的浏览器能力探测失败，请稍后重试或重新登录。", name)
	default:
		return "账号运行出现风险", fmt.Sprintf("账号「%s」出现运行风险：%s。", name, code)
	}
}

func stringPtr(value string) *string { return &value }

var _ notification.Repository = (*NotificationRepo)(nil)
