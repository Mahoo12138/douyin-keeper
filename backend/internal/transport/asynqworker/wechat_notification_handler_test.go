package asynqworker

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/wechat"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

type wechatNotificationLoader struct {
	message *postgres.PendingMessage
}

func (l wechatNotificationLoader) FetchByPublicID(context.Context, string) (*postgres.PendingMessage, error) {
	return l.message, nil
}

type wechatDeliveryRepo struct {
	delivery      *notification.WechatDelivery
	sent          bool
	skipped       string
	failed        string
	markFailedErr error
}

func (r *wechatDeliveryRepo) EnsureWechatDelivery(context.Context, uuid.UUID) error { return nil }

func (r *wechatDeliveryRepo) GetWechatDelivery(context.Context, uuid.UUID) (*notification.WechatDelivery, error) {
	copy := *r.delivery
	return &copy, nil
}

func (r *wechatDeliveryRepo) MarkWechatDeliverySent(context.Context, uuid.UUID, time.Time) error {
	r.sent = true
	r.delivery.Status = notification.DeliverySent
	return nil
}

func (r *wechatDeliveryRepo) MarkWechatDeliverySkipped(_ context.Context, _ uuid.UUID, reason string, _ time.Time) error {
	r.skipped = reason
	r.delivery.Status = notification.DeliverySkipped
	return nil
}

func (r *wechatDeliveryRepo) MarkWechatDeliveryFailed(_ context.Context, _ uuid.UUID, code string, _ time.Time) error {
	r.failed = code
	r.delivery.Status = notification.DeliveryFailed
	r.delivery.Attempts++
	return r.markFailedErr
}

type wechatNotificationSender struct {
	message *wechat.SubscriptionMessage
	err     error
}

func (s *wechatNotificationSender) SendSubscription(_ context.Context, message wechat.SubscriptionMessage) error {
	s.message = &message
	return s.err
}

func newWechatNotificationTask(publicID uuid.UUID) (*asynq.Task, *postgres.PendingMessage) {
	payload, _ := json.Marshal(map[string]string{"notification_id": publicID.String()})
	message := &postgres.PendingMessage{PublicID: "outbox-1", Payload: payload}
	taskPayload, _ := json.Marshal(map[string]string{"outbox_id": message.PublicID})
	return asynq.NewTask(notificationType, taskPayload), message
}

const notificationType = "notification.wechat.send"

func TestWechatNotificationHandlerSendsAndMarksDelivery(t *testing.T) {
	publicID := uuid.New()
	task, message := newWechatNotificationTask(publicID)
	repo := &wechatDeliveryRepo{delivery: &notification.WechatDelivery{
		NotificationPublicID: publicID, OpenID: "openid-1", WechatEnabled: true,
		Title: "账号失效", Body: "请重新登录", Status: notification.DeliveryPending,
	}}
	sender := &wechatNotificationSender{}
	handler := wechatNotificationHandler(wechatNotificationLoader{message: message}, WechatNotificationDeps{
		Deliveries: repo, Sender: sender, TemplateID: "template-1", Page: "pages/index/index",
		Now: func() time.Time { return time.Date(2026, 8, 24, 1, 2, 3, 0, time.UTC) },
	})

	if err := handler(context.Background(), task); err != nil {
		t.Fatal(err)
	}
	if !repo.sent || sender.message == nil || sender.message.ToUser != "openid-1" ||
		sender.message.TemplateID != "template-1" || sender.message.Page != "pages/index/index" ||
		sender.message.Data["thing1"].Value != "账号失效" || sender.message.Data["thing2"].Value != "请重新登录" {
		t.Fatalf("delivery=%+v sent=%t message=%+v", repo.delivery, repo.sent, sender.message)
	}
}

func TestWechatNotificationHandlerSkipsWithoutSubscription(t *testing.T) {
	publicID := uuid.New()
	task, message := newWechatNotificationTask(publicID)
	repo := &wechatDeliveryRepo{delivery: &notification.WechatDelivery{
		NotificationPublicID: publicID, Status: notification.DeliveryPending,
	}}
	sender := &wechatNotificationSender{}
	handler := wechatNotificationHandler(wechatNotificationLoader{message: message}, WechatNotificationDeps{
		Deliveries: repo, Sender: sender, TemplateID: "template-1",
	})

	if err := handler(context.Background(), task); err != nil {
		t.Fatal(err)
	}
	if repo.skipped != "WECHAT_NOTIFICATION_NOT_SUBSCRIBED" || sender.message != nil {
		t.Fatalf("skipped=%q message=%+v", repo.skipped, sender.message)
	}
}

func TestWechatNotificationHandlerMarksFailureAndReturnsRetryableError(t *testing.T) {
	publicID := uuid.New()
	task, message := newWechatNotificationTask(publicID)
	repo := &wechatDeliveryRepo{delivery: &notification.WechatDelivery{
		NotificationPublicID: publicID, OpenID: "openid-1", WechatEnabled: true,
		Status: notification.DeliveryPending,
	}}
	sender := &wechatNotificationSender{err: errors.New("wechat unavailable")}
	handler := wechatNotificationHandler(wechatNotificationLoader{message: message}, WechatNotificationDeps{
		Deliveries: repo, Sender: sender, TemplateID: "template-1",
	})

	err := handler(context.Background(), task)
	if err == nil || repo.failed != "WECHAT_NOTIFICATION_SEND_FAILED" || repo.delivery.Attempts != 1 {
		t.Fatalf("err=%v failed=%q attempts=%d", err, repo.failed, repo.delivery.Attempts)
	}
}

func TestWechatNotificationHandlerPreservesDeliveryStateError(t *testing.T) {
	publicID := uuid.New()
	task, message := newWechatNotificationTask(publicID)
	markErr := errors.New("postgres unavailable")
	repo := &wechatDeliveryRepo{delivery: &notification.WechatDelivery{
		NotificationPublicID: publicID, OpenID: "openid-1", WechatEnabled: true,
		Status: notification.DeliveryPending,
	}, markFailedErr: markErr}
	sendErr := errors.New("wechat unavailable")
	handler := wechatNotificationHandler(wechatNotificationLoader{message: message}, WechatNotificationDeps{
		Deliveries: repo, Sender: &wechatNotificationSender{err: sendErr}, TemplateID: "template-1",
	})

	err := handler(context.Background(), task)
	if err == nil || !errors.Is(err, sendErr) || !errors.Is(err, markErr) {
		t.Fatalf("err=%v, want both send and delivery-state errors", err)
	}
}
