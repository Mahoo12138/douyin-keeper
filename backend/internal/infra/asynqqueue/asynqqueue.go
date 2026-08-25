// Package asynqqueue is the transport adapter between the transactional
// outbox and Asynq (docs/15 §2). Payloads carry only stable IDs — never
// session material, card codes or message bodies.
package asynqqueue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
)

// Task kinds (outbox.kind -> asynq task type). These align with docs/15 §18
// queue split: interactive / browser / light.
const (
	KindAccountBindQR            = "account.bind.qr"
	KindAccountBindSMS           = "account.bind.sms" // future
	KindSessionCheckBrowser      = "account.session_check.browser"
	KindFriendsSyncBrowser       = "account.friends_sync.browser"
	KindConversationsSyncBrowser = "account.conversations_sync.browser"
	KindConversationArchive      = "conversation.archive.browser"
	KindSendDispatch             = "send.dispatch"
	KindSendBrowser              = "send.browser"
	KindSendProtocol             = "send.protocol"
	KindCapabilityProbe          = "capability.probe"
	KindNotificationWechat       = "notification.wechat.send"

	QueueInteractive = "interactive"
	QueueBrowser     = "browser"
	QueueLight       = "light"
)

// QueueFor maps an outbox kind to its worker queue (docs/15 §18).
func QueueFor(kind string) string {
	switch kind {
	case KindAccountBindQR, KindAccountBindSMS:
		return QueueInteractive
	case KindSessionCheckBrowser, KindFriendsSyncBrowser, KindConversationsSyncBrowser, KindConversationArchive, KindSendBrowser:
		return QueueBrowser
	case KindSendDispatch, KindSendProtocol, KindCapabilityProbe, KindNotificationWechat:
		return QueueLight
	default:
		return QueueLight
	}
}

// Client wraps asynq.Client.
type Client struct {
	inner *asynq.Client
}

func NewClient(opt asynq.RedisClientOpt) *Client {
	return &Client{inner: asynq.NewClient(opt)}
}

func (c *Client) Close() error { return c.inner.Close() }

type Message struct {
	// Id, Kind, AggregateID and Payload mirror queue_outbox columns.
	ID            string      // public_id (UUID string)
	Kind          string      // outbox kind
	WorkerPayload interface{} // small struct serialized into the asynq task
}

// Enqueue publishes one outbox record as an asynq task into the queue chosen
// by its kind. Deduplication is a second line of defense; business
// correctness does not rely on it (docs/15 §2.2).
func (c *Client) Enqueue(ctx context.Context, m Message) error {
	payload, err := json.Marshal(m.WorkerPayload)
	if err != nil {
		return err
	}
	task := asynq.NewTask(m.Kind, payload,
		asynq.Queue(QueueFor(m.Kind)),
		asynq.TaskID(fmt.Sprintf("outbox:%s", m.ID)),
	)
	info, err := c.inner.EnqueueContext(ctx, task)
	if err != nil {
		return fmt.Errorf("asynqqueue: enqueue %s: %w", m.Kind, err)
	}
	_ = info
	return nil
}

// Server wraps asynq.Server with per-pool queue concurrency.
func NewServer(opt asynq.RedisClientOpt, queueConcurrency map[string]int) *asynq.Server {
	return asynq.NewServer(
		opt,
		asynq.Config{
			Queues: func() map[string]int {
				if len(queueConcurrency) == 0 {
					return map[string]int{QueueLight: 8}
				}
				return queueConcurrency
			}(),
		},
	)
}

type Handler func(ctx context.Context, task *asynq.Task) error

// RunServer starts a worker pool. It blocks until ctx is cancelled.
func RunServer(srv *asynq.Server, mux *asynq.ServeMux, ctx context.Context) error {
	go func() {
		<-ctx.Done()
		srv.Shutdown()
	}()
	if err := srv.Run(mux); err != nil {
		return err
	}
	return nil
}
