package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/wechat"
	"github.com/mahoo12138/douyin-keeper/backend/internal/notification"
)

func wechatNotificationHandler(loader PayloadLoader, deps WechatNotificationDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, task *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(task.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("wechat notification: invalid outbox payload")
		}
		message, err := loader.FetchByPublicID(ctx, envelope.OutboxID)
		if err != nil {
			return fmt.Errorf("wechat notification: load outbox: %w", err)
		}
		var ref struct {
			NotificationID string `json:"notification_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil || ref.NotificationID == "" {
			return fmt.Errorf("wechat notification: invalid notification payload")
		}
		publicID, err := uuid.Parse(ref.NotificationID)
		if err != nil {
			return fmt.Errorf("wechat notification: invalid notification id: %w", err)
		}
		delivery, err := deps.Deliveries.GetWechatDelivery(ctx, publicID)
		if err != nil {
			return err
		}
		if delivery.Status == notification.DeliverySent || delivery.Status == notification.DeliverySkipped {
			return nil
		}
		now := time.Now()
		if deps.Now != nil {
			now = deps.Now()
		}
		skip := func(reason string) error {
			err := deps.Deliveries.MarkWechatDeliverySkipped(ctx, publicID, reason, now)
			if err == nil {
				deps.Metrics.AddCounter("wechat_notification_delivery_total", 1, telemetry.Label{Name: "status", Value: string(notification.DeliverySkipped)})
			}
			return err
		}
		if deps.Sender == nil || deps.TemplateID == "" {
			return skip("WECHAT_NOTIFICATION_NOT_CONFIGURED")
		}
		if !delivery.WechatEnabled || delivery.OpenID == "" {
			return skip("WECHAT_NOTIFICATION_NOT_SUBSCRIBED")
		}
		titleField := deps.TitleField
		if titleField == "" {
			titleField = "thing1"
		}
		bodyField := deps.BodyField
		if bodyField == "" {
			bodyField = "thing2"
		}
		if err := deps.Sender.SendSubscription(ctx, wechat.SubscriptionMessage{
			ToUser: delivery.OpenID, TemplateID: deps.TemplateID, Page: deps.Page,
			Data: map[string]wechat.SubscriptionValue{
				titleField: {Value: delivery.Title},
				bodyField:  {Value: delivery.Body},
			},
		}); err != nil {
			_ = deps.Deliveries.MarkWechatDeliveryFailed(ctx, publicID, "WECHAT_NOTIFICATION_SEND_FAILED", now)
			deps.Metrics.AddCounter("wechat_notification_delivery_total", 1, telemetry.Label{Name: "status", Value: string(notification.DeliveryFailed)})
			return err
		}
		err = deps.Deliveries.MarkWechatDeliverySent(ctx, publicID, now)
		if err == nil {
			deps.Metrics.AddCounter("wechat_notification_delivery_total", 1, telemetry.Label{Name: "status", Value: string(notification.DeliverySent)})
		}
		return err
	}
}
