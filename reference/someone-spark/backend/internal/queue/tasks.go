package queue

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/hibiken/asynq"
)

const (
	TypeLoginQR        = "login.qr"
	TypeLoginSMSStart  = "login.sms.start"
	TypeLoginSMSVerify = "login.sms.verify"
	TypeSessionCheck   = "session.check"
	TypeFriendsSync    = "friends.sync"
	TypeChatArchive    = "chat.archive_sync"
	TypeChatSend       = "chat.send"
	TypeTaskTick       = "task.tick"
	QueueDefault       = "default"
	QueueCritical      = "critical"
	QueueLogin         = "login"
)

func TaskQueue(typ string) string {
	switch typ {
	case TypeLoginQR, TypeLoginSMSStart, TypeLoginSMSVerify:
		return QueueLogin
	default:
		return QueueDefault
	}
}

func WorkerQueues() map[string]int {
	return map[string]int{QueueLogin: 6, QueueDefault: 3, QueueCritical: 1}
}

func WorkerQueueNames() []string {
	return []string{QueueLogin, QueueDefault, QueueCritical}
}

type AccountJob struct {
	JobID      string `json:"job_id"`
	UserID     int64  `json:"user_id"`
	AccountID  int64  `json:"account_id"`
	PublicID   string `json:"public_id"`
	Phone      string `json:"phone,omitempty"`
	SMSSess    string `json:"sms_session,omitempty"`
	SMSCode    string `json:"sms_code,omitempty"`
	FriendID   int64  `json:"friend_id,omitempty"`
	FriendName string `json:"friend_name,omitempty"`
	Body       string `json:"body,omitempty"`
	StickerKey string `json:"sticker_key,omitempty"`
	Kind       string `json:"kind,omitempty"`
	DryRun     bool   `json:"dry_run,omitempty"`
}

func enqueue(ctx context.Context, c *asynq.Client, typ string, p AccountJob, timeout time.Duration) error {
	_, err := enqueueRetry(ctx, c, typ, p, timeout, 1)
	return err
}

func enqueueRetry(ctx context.Context, c *asynq.Client, typ string, p AccountJob, timeout time.Duration, maxRetry int) (*asynq.TaskInfo, error) {
	b, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	t := asynq.NewTask(typ, b, asynq.MaxRetry(maxRetry), asynq.Timeout(timeout), asynq.Queue(TaskQueue(typ)))
	return c.EnqueueContext(ctx, t)
}

func EnqueueLoginQR(ctx context.Context, c *asynq.Client, p AccountJob) error {
	info, err := enqueueRetry(ctx, c, TypeLoginQR, p, 10*time.Minute, 0)
	if err != nil {
		return err
	}
	qid, tid := TaskQueue(TypeLoginQR), ""
	if info != nil {
		qid, tid = info.Queue, info.ID
	}
	slog.Info("login_qr 已入队", "queue", qid, "task_id", tid, "job_id", p.JobID, "account_id", p.AccountID)
	return nil
}

func EnqueueSMSStart(ctx context.Context, c *asynq.Client, p AccountJob) error {
	_, err := enqueueRetry(ctx, c, TypeLoginSMSStart, p, 2*time.Minute, 0)
	return err
}

func EnqueueSMSVerify(ctx context.Context, c *asynq.Client, p AccountJob) error {
	_, err := enqueueRetry(ctx, c, TypeLoginSMSVerify, p, 3*time.Minute, 0)
	return err
}

func EnqueueSessionCheck(ctx context.Context, c *asynq.Client, p AccountJob) error {
	return enqueue(ctx, c, TypeSessionCheck, p, 90*time.Second)
}

func EnqueueFriendsSync(ctx context.Context, c *asynq.Client, p AccountJob) error {
	return enqueue(ctx, c, TypeFriendsSync, p, 4*time.Minute)
}

func EnqueueChatArchive(ctx context.Context, c *asynq.Client, p AccountJob) error {
	return enqueue(ctx, c, TypeChatArchive, p, 4*time.Minute)
}

func EnqueueChatSend(ctx context.Context, c *asynq.Client, p AccountJob) error {
	return enqueue(ctx, c, TypeChatSend, p, 2*time.Minute)
}

func EnqueueChatSendIn(ctx context.Context, c *asynq.Client, p AccountJob, delay time.Duration) error {
	b, err := json.Marshal(p)
	if err != nil {
		return err
	}
	t := asynq.NewTask(TypeChatSend, b, asynq.MaxRetry(1), asynq.Timeout(2*time.Minute), asynq.Queue(QueueDefault), asynq.ProcessIn(delay))
	_, err = c.EnqueueContext(ctx, t)
	return err
}

func EnqueueTaskTick(ctx context.Context, c *asynq.Client) error {
	t := asynq.NewTask(TypeTaskTick, []byte(`{}`), asynq.MaxRetry(0), asynq.Timeout(2*time.Minute), asynq.Queue(QueueDefault))
	_, err := c.EnqueueContext(ctx, t)
	return err
}
