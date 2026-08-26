package asynqworker

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/telemetry"
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
		message, err := loadPendingMessage(ctx, loader, envelope.OutboxID, "capability probe: load outbox")
		if err != nil {
			return err
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
		checkedAt := now()
		results := make([]adapterProbeResult, 0, len(probeSidecars(deps)))
		for _, probe := range probeSidecars(deps) {
			result, probeErr := runAdapterProbe(ctx, ref.AccountID, probe, checkedAt)
			if probeErr != nil {
				return probeErr
			}
			results = append(results, result)
			healthValue := float64(1)
			if result.failureCode != "" {
				healthValue = 0
			}
			deps.Metrics.SetGauge("adapter_health", healthValue, telemetry.Label{Name: "adapter", Value: result.adapter})
		}
		return deps.Tx.WithinTx(ctx, func(tctx context.Context) error {
			for _, result := range results {
				if deps.Health != nil {
					if result.failureCode != "" {
						if err := deps.Health.ObserveFailure(tctx, result.adapter, result.version, result.failureCode, checkedAt); err != nil {
							return err
						}
					} else if err := deps.Health.ObserveSuccess(tctx, result.adapter, result.version, checkedAt); err != nil {
						return err
					}
				}
				for _, snapshot := range result.snapshots {
					if err := deps.Snapshots.Upsert(tctx, snapshot); err != nil {
						return err
					}
				}
			}
			return nil
		})
	}
}

type adapterProbeResult struct {
	adapter     string
	version     string
	failureCode string
	snapshots   []capability.Capability
}

func probeSidecarsConfigured(deps CapabilityProbeDeps) bool {
	return len(probeSidecars(deps)) > 0
}

func probeSidecars(deps CapabilityProbeDeps) []AdapterSidecar {
	if len(deps.Sidecars) > 0 {
		out := make([]AdapterSidecar, 0, len(deps.Sidecars))
		for _, probe := range deps.Sidecars {
			if probe.Client != nil {
				out = append(out, probe)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	if deps.Sidecar == nil {
		return nil
	}
	adapter := deps.Adapter
	if adapter == "" {
		adapter = capability.AdapterBrowserConsumer
	}
	return []AdapterSidecar{{Adapter: adapter, Client: deps.Sidecar}}
}

func runAdapterProbe(ctx context.Context, accountID int64, probe AdapterSidecar, checkedAt time.Time) (adapterProbeResult, error) {
	adapter := probe.Adapter
	if adapter == "" {
		adapter = capability.AdapterBrowserConsumer
	}
	result := adapterProbeResult{adapter: adapter}
	response, callErr := probe.Client.Call(ctx, sidecar.Request{
		ProtocolVersion: sidecar.ProtocolVersion, RequestID: uuid.New().String(),
		Op: sidecar.OpsHealthCheck, DeadlineMS: 5_000, Input: map[string]any{},
	})
	if callErr != nil {
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		result.failureCode = sidecar.ErrAdapterUnavailable
		result.snapshots = unavailableSnapshots(accountID, adapter, result.failureCode, checkedAt)
		return result, nil
	}
	if response == nil || !response.OK || response.Error != nil {
		code := sidecar.ErrAdapterUnavailable
		if response != nil && response.Error != nil && response.Error.Code != "" {
			code = response.Error.Code
		}
		result.failureCode = code
		result.version = responseVersion(response)
		result.snapshots = unavailableSnapshots(accountID, adapter, code, checkedAt)
		return result, nil
	}

	var health capability.HealthSnapshot
	body, decodeErr := json.Marshal(response.Result)
	if decodeErr != nil || json.Unmarshal(body, &health) != nil || health.Status == "" {
		result.failureCode = sidecar.ErrAdapterIncompatible
		result.version = responseVersion(response)
		result.snapshots = unavailableSnapshots(accountID, adapter, result.failureCode, checkedAt)
		return result, nil
	}
	reportedAdapter := health.Adapter
	if reportedAdapter == "" {
		reportedAdapter = response.Meta.Adapter
	}
	if reportedAdapter != "" && reportedAdapter != adapter {
		result.failureCode = sidecar.ErrAdapterIncompatible
		result.version = health.Version
		result.snapshots = unavailableSnapshots(accountID, adapter, result.failureCode, checkedAt)
		return result, nil
	}
	health.Adapter = adapter
	if health.Version == "" {
		health.Version = response.Meta.AdapterVersion
	}
	result.version = health.Version
	if health.Status != capability.AdapterStatusHealthy {
		result.failureCode = sidecar.ErrAdapterUnavailable
	}
	result.snapshots = capability.FromHealth(accountID, health, checkedAt)
	for i := range result.snapshots {
		adapterCopy := adapter
		result.snapshots[i].Adapter = &adapterCopy
		if result.snapshots[i].Status != capability.StatusAvailable {
			code := sidecar.ErrAdapterUnavailable
			result.snapshots[i].ErrorCode = &code
		}
	}
	return result, nil
}

func responseVersion(response *sidecar.Response) string {
	if response == nil {
		return ""
	}
	return response.Meta.AdapterVersion
}

func unavailableSnapshots(accountID int64, adapter, code string, checkedAt time.Time) []capability.Capability {
	result := make([]capability.Capability, 0, len(capability.KnownNames))
	adapterCopy := adapter
	for _, name := range capability.KnownNames {
		errorCode := code
		result = append(result, capability.Capability{AccountID: accountID, Name: name,
			Status: capability.StatusUnavailable, Adapter: &adapterCopy, ErrorCode: &errorCode, CheckedAt: checkedAt})
	}
	return result
}
