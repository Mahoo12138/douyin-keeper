package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/asynqqueue"
	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

func sendDispatchHandler(loader PayloadLoader, deps SendDispatchDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("send dispatch: invalid outbox payload")
		}
		message, err := loader.FetchByPublicID(ctx, envelope.OutboxID)
		if err != nil {
			return fmt.Errorf("send dispatch: load outbox: %w", err)
		}
		var ref struct {
			IntentID string `json:"intent_id"`
			JobID    string `json:"job_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil {
			return fmt.Errorf("send dispatch: invalid job payload: %w", err)
		}
		jobPublicID, err := uuid.Parse(ref.JobID)
		if err != nil {
			return fmt.Errorf("send dispatch: invalid job id: %w", err)
		}
		if deps.Sends == nil || deps.Outbox == nil || deps.Tx == nil {
			return apperr.New(apperr.CodeInternal, apperr.KindInternal, "send dispatch is not configured")
		}
		j, err := deps.Sends.GetJobByPublicID(ctx, jobPublicID)
		if err != nil {
			return err
		}
		if j.Status != send.JobQueued {
			return nil
		}
		if ref.IntentID != "" {
			intentID, parseErr := uuid.Parse(ref.IntentID)
			if parseErr != nil {
				return fmt.Errorf("send dispatch: invalid intent id: %w", parseErr)
			}
			intent, intentErr := deps.Sends.GetIntentByPublicID(ctx, intentID)
			if intentErr != nil {
				return intentErr
			}
			if intent.Status.Terminal() {
				return nil
			}
		}
		route := capability.Route{Adapter: capability.AdapterBrowserConsumer, Capability: capability.NameMessageTextExisting,
			Reason: "resolver_unconfigured"}
		if deps.Resolver != nil && deps.Tasks != nil && ref.IntentID != "" {
			intentID, parseErr := uuid.Parse(ref.IntentID)
			if parseErr != nil {
				return fmt.Errorf("send dispatch: invalid intent id: %w", parseErr)
			}
			intent, intentErr := deps.Sends.GetIntentByPublicID(ctx, intentID)
			if intentErr != nil {
				return intentErr
			}
			if intent.TaskID != nil {
				tk, taskErr := deps.Tasks.GetByID(ctx, *intent.TaskID)
				if taskErr != nil {
					return taskErr
				}
				hasConversation := true
				if deps.Friends != nil {
					hasConversation, taskErr = deps.Friends.HasConversation(ctx, intent.AccountID, intent.FriendID)
					if taskErr != nil {
						return taskErr
					}
				}
				resolved, resolveErr := deps.Resolver.Resolve(ctx, intent.AccountID, capability.ResolveRequest{
					MessageKind: tk.MessageKind, HasConversation: hasConversation, AllowFirstMessage: tk.AllowFirstMessage,
				})
				if resolveErr != nil {
					return resolveErr
				}
				route = resolved
			}
		}
		now := deps.Now
		if now == nil {
			now = time.Now
		}
		return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
			if routeStore, ok := deps.Sends.(interface {
				SetSelectedAdapter(context.Context, int64, string) error
			}); ok && route.Adapter != "" {
				if err := routeStore.SetSelectedAdapter(tctx, j.ID, route.Adapter); err != nil {
					return err
				}
			}
			return deps.Outbox.Add(tctx, outboxMessageForSendAdapter(j.PublicID, route.Adapter, now()))
		})
	}
}

func outboxMessageForSendBrowser(jobPublicID uuid.UUID, at time.Time) outbox.Message {
	return outboxMessageForSendAdapter(jobPublicID, capability.AdapterBrowserConsumer, at)
}

func outboxMessageForSendAdapter(jobPublicID uuid.UUID, adapter string, at time.Time) outbox.Message {
	kind := asynqqueue.KindSendBrowser
	if adapter == capability.AdapterProtocolIM {
		kind = asynqqueue.KindSendProtocol
	}
	return outbox.Message{
		Kind: kind, AggregateType: "send_job", AggregateID: jobPublicID.String(),
		Payload:     mustJSON(map[string]string{"job_id": jobPublicID.String()}),
		AvailableAt: at, DedupeKey: string(kind) + ":" + jobPublicID.String(),
	}
}
