package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

func capabilityProbeHandler(loader PayloadLoader, deps CapabilityProbeDeps) func(context.Context, *asynq.Task) error {
	return func(ctx context.Context, t *asynq.Task) error {
		var envelope struct {
			OutboxID string `json:"outbox_id"`
		}
		if err := json.Unmarshal(t.Payload(), &envelope); err != nil || envelope.OutboxID == "" {
			return fmt.Errorf("capability probe: invalid outbox payload")
		}
		message, err := loader.FetchByPublicID(ctx, envelope.OutboxID)
		if err != nil {
			return fmt.Errorf("capability probe: load outbox: %w", err)
		}
		var ref struct {
			AccountID int64 `json:"account_id"`
		}
		if err := json.Unmarshal(message.Payload, &ref); err != nil || ref.AccountID <= 0 {
			return fmt.Errorf("capability probe: invalid account id")
		}
		now := time.Now
		if deps.Now != nil {
			now = deps.Now
		}
		adapter := deps.Adapter
		if adapter == "" {
			adapter = capability.AdapterBrowserConsumer
		}
		version := ""
		failureCode := ""
		response, callErr := deps.Sidecar.Call(ctx, sidecar.Request{
			ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
			Op: sidecar.OpsHealthCheck, DeadlineMS: 5_000, Input: map[string]any{},
		})
		if deps.Adapter == "" && response != nil && response.Meta.Adapter != "" {
			adapter = response.Meta.Adapter
		}
		checkedAt := now()
		var snapshots []capability.Capability
		if callErr != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			failureCode = sidecar.ErrAdapterUnavailable
			snapshots = unavailableSnapshots(ref.AccountID, sidecar.ErrAdapterUnavailable, checkedAt)
		} else if response == nil || !response.OK || response.Error != nil {
			code := sidecar.ErrAdapterUnavailable
			if response != nil && response.Error != nil && response.Error.Code != "" {
				code = response.Error.Code
			}
			failureCode = code
			snapshots = unavailableSnapshots(ref.AccountID, code, checkedAt)
		} else {
			var result capability.HealthSnapshot
			body, decodeErr := json.Marshal(response.Result)
			if decodeErr != nil || json.Unmarshal(body, &result) != nil || result.Status == "" {
				failureCode = sidecar.ErrAdapterIncompatible
				snapshots = unavailableSnapshots(ref.AccountID, sidecar.ErrAdapterIncompatible, checkedAt)
			} else {
				if result.Adapter == "" {
					result.Adapter = response.Meta.Adapter
				}
				if result.Version == "" {
					result.Version = response.Meta.AdapterVersion
				}
				if result.Adapter != "" {
					adapter = result.Adapter
				}
				version = result.Version
				if result.Status != capability.AdapterStatusHealthy {
					failureCode = sidecar.ErrAdapterUnavailable
				}
				snapshots = capability.FromHealth(ref.AccountID, result, checkedAt)
				for i := range snapshots {
					if snapshots[i].Status != capability.StatusAvailable {
						code := sidecar.ErrAdapterUnavailable
						snapshots[i].ErrorCode = &code
					}
				}
			}
		}
		return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
			if deps.Health != nil {
				if failureCode != "" {
					if err := deps.Health.ObserveFailure(tctx, adapter, version, failureCode, checkedAt); err != nil {
						return err
					}
				} else if err := deps.Health.ObserveSuccess(tctx, adapter, version, checkedAt); err != nil {
					return err
				}
			}
			for _, snapshot := range snapshots {
				if err := deps.Snapshots.Upsert(tctx, snapshot); err != nil {
					return err
				}
			}
			return nil
		})
	}
}

func unavailableSnapshots(accountID int64, code string, checkedAt time.Time) []capability.Capability {
	result := make([]capability.Capability, 0, len(capability.KnownNames))
	for _, name := range capability.KnownNames {
		errorCode := code
		result = append(result, capability.Capability{AccountID: accountID, Name: name,
			Status: capability.StatusUnavailable, ErrorCode: &errorCode, CheckedAt: checkedAt})
	}
	return result
}
