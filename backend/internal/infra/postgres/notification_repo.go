package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

type NotificationRepo struct {
	pool  *pgxpool.Pool
	relay outbox.Outbox
}

func NewNotificationRepo(pool *pgxpool.Pool, relays ...outbox.Outbox) *NotificationRepo {
	var relay outbox.Outbox
	if len(relays) > 0 {
		relay = relays[0]
	}
	return &NotificationRepo{pool: pool, relay: relay}
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
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO notifications
			(public_id, user_id, type, priority, title, body, resource_type, resource_id, dedupe_key, created_at, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),$10,$11)
		ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
		DO UPDATE SET public_id=notifications.public_id
		RETURNING public_id`,
		item.PublicID, item.UserID, item.Type, item.Priority, item.Title, item.Body,
		item.ResourceType, item.ResourceID, item.DedupeKey, createdAt, item.ExpiresAt).Scan(&item.PublicID)
	return err
}

// CreateIfAbsent inserts a notification only when its user-scoped dedupe key
// is new. It is used by periodic producers that need accurate created counts.
func (r *NotificationRepo) CreateIfAbsent(ctx context.Context, item *notification.Notification) (bool, error) {
	if item.PublicID == uuid.Nil {
		item.PublicID = uuid.New()
	}
	createdAt := item.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now()
	}
	var publicID uuid.UUID
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO notifications
			(public_id, user_id, type, priority, title, body, resource_type, resource_id, dedupe_key, created_at, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),$10,$11)
		ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
		RETURNING public_id`,
		item.PublicID, item.UserID, item.Type, item.Priority, item.Title, item.Body,
		item.ResourceType, item.ResourceID, item.DedupeKey, createdAt, item.ExpiresAt).Scan(&publicID)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	item.PublicID = publicID
	return true, nil
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
		PublicID: uuid.New(), UserID: userID, Type: notification.TypeRiskEvent, Priority: priority,
		Title: title, Body: body, ResourceType: stringPtr("account"),
		ResourceID: stringPtr(publicID.String()),
		DedupeKey:  fmt.Sprintf("risk:%d:%s:%s", accountID, code, createdAt.In(loc).Format("2006-01-02")),
		CreatedAt:  createdAt,
	}
	if err := r.Create(ctx, item); err != nil {
		return err
	}
	if err := r.EnsureWechatDelivery(ctx, item.PublicID); err != nil {
		return err
	}
	if r.relay == nil {
		return nil
	}
	payload, err := json.Marshal(map[string]string{"notification_id": item.PublicID.String()})
	if err != nil {
		return err
	}
	return r.relay.Add(ctx, outbox.Message{
		Kind: outbox.KindNotificationWechat, AggregateType: "notification",
		AggregateID: item.PublicID.String(), Payload: payload,
		DedupeKey: "notification.wechat:" + item.PublicID.String(),
	})
}

func (r *NotificationRepo) GetPreferences(ctx context.Context, userID int64) (*notification.Preferences, error) {
	var item notification.Preferences
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT user_id, wechat_enabled, updated_at
		FROM notification_preferences WHERE user_id=$1`, userID).
		Scan(&item.UserID, &item.WechatEnabled, &item.UpdatedAt)
	if err == pgx.ErrNoRows {
		return &notification.Preferences{UserID: userID}, nil
	}
	return &item, err
}

func (r *NotificationRepo) SetWechatEnabled(ctx context.Context, userID int64, enabled bool, at time.Time) (*notification.Preferences, error) {
	var item notification.Preferences
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO notification_preferences (user_id, wechat_enabled, updated_at)
		VALUES ($1,$2,$3)
		ON CONFLICT (user_id) DO UPDATE SET wechat_enabled=EXCLUDED.wechat_enabled, updated_at=EXCLUDED.updated_at
		RETURNING user_id, wechat_enabled, updated_at`, userID, enabled, at).
		Scan(&item.UserID, &item.WechatEnabled, &item.UpdatedAt)
	return &item, err
}

func (r *NotificationRepo) EnsureWechatDelivery(ctx context.Context, publicID uuid.UUID) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO notification_deliveries (notification_id, channel)
		SELECT id, 'wechat' FROM notifications WHERE public_id=$1
		ON CONFLICT (notification_id, channel) DO NOTHING`, publicID)
	return err
}

func (r *NotificationRepo) GetWechatDelivery(ctx context.Context, publicID uuid.UUID) (*notification.WechatDelivery, error) {
	var item notification.WechatDelivery
	var openID *string
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT n.id, n.id, n.public_id, n.user_id, n.title, n.body, n.created_at,
		       d.status, d.attempts, d.last_error_code,
		       COALESCE(p.wechat_enabled, false),
		       (SELECT ai.provider_subject FROM auth_identities ai
			  WHERE ai.user_id=n.user_id AND ai.provider='wechat_mini'
			  ORDER BY ai.id DESC LIMIT 1)
		FROM notifications n
		JOIN notification_deliveries d ON d.notification_id=n.id AND d.channel='wechat'
		LEFT JOIN notification_preferences p ON p.user_id=n.user_id
		WHERE n.public_id=$1`, publicID).Scan(
		&item.ID, &item.NotificationID, &item.NotificationPublicID, &item.UserID,
		&item.Title, &item.Body, &item.CreatedAt, &item.Status, &item.Attempts,
		&item.LastErrorCode, &item.WechatEnabled, &openID)
	if err == pgx.ErrNoRows {
		return nil, apperr.NotFound(apperr.CodeNotFound, "notification delivery not found")
	}
	if err != nil {
		return nil, err
	}
	if openID != nil {
		item.OpenID = *openID
	}
	return &item, nil
}

func (r *NotificationRepo) MarkWechatDeliverySent(ctx context.Context, publicID uuid.UUID, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE notification_deliveries d SET status='sent', sent_at=$2, updated_at=$2
		FROM notifications n WHERE d.notification_id=n.id AND d.channel='wechat' AND n.public_id=$1`, publicID, at)
	return err
}

func (r *NotificationRepo) MarkWechatDeliverySkipped(ctx context.Context, publicID uuid.UUID, reason string, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE notification_deliveries d SET status='skipped', last_error_code=$2, updated_at=$3
		FROM notifications n WHERE d.notification_id=n.id AND d.channel='wechat' AND n.public_id=$1`, publicID, reason, at)
	return err
}

func (r *NotificationRepo) MarkWechatDeliveryFailed(ctx context.Context, publicID uuid.UUID, code string, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE notification_deliveries d SET status='failed', attempts=attempts+1,
			last_error_code=$2, last_error_at=$3, updated_at=$3
		FROM notifications n WHERE d.notification_id=n.id AND d.channel='wechat' AND n.public_id=$1`, publicID, code, at)
	return err
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
var _ notification.DeliveryRepository = (*NotificationRepo)(nil)
