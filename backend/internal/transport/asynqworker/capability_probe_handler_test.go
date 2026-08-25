package asynqworker

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/hibiken/asynq"

	"github.com/mahoo12138/douyin-keeper/backend/internal/capability"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

type probeLoader struct{ message *postgres.PendingMessage }

func (l probeLoader) FetchByPublicID(context.Context, string) (*postgres.PendingMessage, error) {
	return l.message, nil
}

type probeSnapshotRepo struct{ snapshots []capability.Capability }

func (r *probeSnapshotRepo) ListByAccount(context.Context, int64) ([]capability.Capability, error) {
	return r.snapshots, nil
}

func (r *probeSnapshotRepo) GetByAccountAndName(_ context.Context, accountID int64, name string) (*capability.Capability, error) {
	for _, snapshot := range r.snapshots {
		if snapshot.AccountID == accountID && snapshot.Name == name {
			copy := snapshot
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *probeSnapshotRepo) GetByAccountAndNameAndAdapter(_ context.Context, accountID int64, name, adapter string) (*capability.Capability, error) {
	for _, snapshot := range r.snapshots {
		if snapshot.AccountID == accountID && snapshot.Name == name && snapshot.Adapter != nil && *snapshot.Adapter == adapter {
			copy := snapshot
			return &copy, nil
		}
	}
	return nil, nil
}

func (r *probeSnapshotRepo) Upsert(_ context.Context, snapshot capability.Capability) error {
	for i := range r.snapshots {
		if r.snapshots[i].AccountID == snapshot.AccountID && r.snapshots[i].Name == snapshot.Name && sameAdapter(r.snapshots[i].Adapter, snapshot.Adapter) {
			r.snapshots[i] = snapshot
			return nil
		}
	}
	r.snapshots = append(r.snapshots, snapshot)
	return nil
}

func sameAdapter(left, right *string) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}

type probeTx struct{}

func (probeTx) WithinTx(ctx context.Context, fn func(context.Context) error) error { return fn(ctx) }

type probeSidecar struct {
	request  sidecar.Request
	response *sidecar.Response
}

type probeHealthObserver struct {
	successes int
	failures  []string
}

func (h *probeHealthObserver) Allow(context.Context, string) (bool, error) { return true, nil }

func (h *probeHealthObserver) ObserveSuccess(context.Context, string, string, time.Time) error {
	h.successes++
	return nil
}

func (h *probeHealthObserver) ObserveFailure(_ context.Context, _ string, _ string, code string, _ time.Time) error {
	h.failures = append(h.failures, code)
	return nil
}

func (s *probeSidecar) Call(_ context.Context, request sidecar.Request) (*sidecar.Response, error) {
	s.request = request
	return s.response, nil
}

func TestCapabilityProbePersistsHealthSnapshot(t *testing.T) {
	checkedAt := time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC)
	repo := &probeSnapshotRepo{}
	health := &probeHealthObserver{}
	client := &probeSidecar{response: &sidecar.Response{
		ProtocolVersion: sidecar.ProtocolVersion,
		OK:              true,
		Result: map[string]any{
			"status":       "healthy",
			"adapter":      "browser.consumer",
			"version":      "0.1.0",
			"capabilities": []string{capability.NameMessageTextExisting},
		},
		Meta: sidecar.Meta{Adapter: "browser.consumer", AdapterVersion: "0.1.0"},
	}}
	loader := probeLoader{message: &postgres.PendingMessage{
		PublicID: "probe-outbox",
		Payload:  json.RawMessage(`{"account_id":42}`),
	}}
	handler := capabilityProbeHandler(loader, CapabilityProbeDeps{
		Snapshots: repo, Sidecar: client, Tx: probeTx{}, Health: health,
		Adapter: capability.AdapterBrowserConsumer, Now: func() time.Time { return checkedAt },
	})
	if err := handler(context.Background(), asynq.NewTask("capability.probe", []byte(`{"outbox_id":"probe-outbox"}`))); err != nil {
		t.Fatalf("probe failed: %v", err)
	}
	if client.request.Op != sidecar.OpsHealthCheck || client.request.DeadlineMS != 5000 {
		t.Fatalf("unexpected health request: %+v", client.request)
	}
	if len(repo.snapshots) != len(capability.KnownNames) {
		t.Fatalf("persisted %d snapshots, want %d", len(repo.snapshots), len(capability.KnownNames))
	}
	if health.successes != 1 || len(health.failures) != 0 {
		t.Fatalf("health success observation mismatch: successes=%d failures=%v", health.successes, health.failures)
	}
	send, err := repo.GetByAccountAndName(context.Background(), 42, capability.NameMessageTextExisting)
	if err != nil || send == nil || send.Status != capability.StatusAvailable {
		t.Fatalf("send capability snapshot = %+v, err=%v", send, err)
	}
	friends, err := repo.GetByAccountAndName(context.Background(), 42, capability.NameFriendsSync)
	if err != nil || friends == nil || friends.Status != capability.StatusUnavailable || friends.ErrorCode == nil || *friends.ErrorCode != sidecar.ErrAdapterUnavailable {
		t.Fatalf("missing capability snapshot = %+v, err=%v", friends, err)
	}
}

func TestCapabilityProbeFailsClosedWhenSidecarUnavailable(t *testing.T) {
	repo := &probeSnapshotRepo{}
	health := &probeHealthObserver{}
	client := &probeSidecar{response: &sidecar.Response{
		ProtocolVersion: sidecar.ProtocolVersion,
		OK:              false,
		Error:           &sidecar.Error{Code: sidecar.ErrAdapterUnavailable},
	}}
	handler := capabilityProbeHandler(probeLoader{message: &postgres.PendingMessage{
		Payload: json.RawMessage(`{"account_id":42}`),
	}}, CapabilityProbeDeps{Snapshots: repo, Sidecar: client, Tx: probeTx{}, Health: health,
		Adapter: capability.AdapterBrowserConsumer})
	if err := handler(context.Background(), asynq.NewTask("capability.probe", []byte(`{"outbox_id":"probe-outbox"}`))); err != nil {
		t.Fatalf("probe failed: %v", err)
	}
	if len(repo.snapshots) != len(capability.KnownNames) {
		t.Fatalf("persisted %d snapshots, want %d", len(repo.snapshots), len(capability.KnownNames))
	}
	if len(health.failures) != 1 || health.failures[0] != sidecar.ErrAdapterUnavailable {
		t.Fatalf("health failure observation mismatch: %v", health.failures)
	}
	for _, snapshot := range repo.snapshots {
		if snapshot.Status != capability.StatusUnavailable || snapshot.ErrorCode == nil || *snapshot.ErrorCode != sidecar.ErrAdapterUnavailable {
			t.Fatalf("unexpected unavailable snapshot: %+v", snapshot)
		}
	}
}

func TestCapabilityProbePersistsBrowserAndProtocolSnapshotsSeparately(t *testing.T) {
	repo := &probeSnapshotRepo{}
	health := &probeHealthObserver{}
	browser := &probeSidecar{response: &sidecar.Response{
		ProtocolVersion: sidecar.ProtocolVersion, OK: true,
		Result: map[string]any{"status": "healthy", "adapter": capability.AdapterBrowserConsumer, "version": "browser-1", "capabilities": []string{capability.NameMessageTextExisting}},
		Meta:   sidecar.Meta{Adapter: capability.AdapterBrowserConsumer, AdapterVersion: "browser-1"},
	}}
	protocol := &probeSidecar{response: &sidecar.Response{
		ProtocolVersion: sidecar.ProtocolVersion, OK: true,
		Result: map[string]any{"status": "healthy", "adapter": capability.AdapterProtocolIM, "version": "protocol-1", "capabilities": []string{capability.NameMessageTextFirst}},
		Meta:   sidecar.Meta{Adapter: capability.AdapterProtocolIM, AdapterVersion: "protocol-1"},
	}}
	handler := capabilityProbeHandler(probeLoader{message: &postgres.PendingMessage{
		Payload: json.RawMessage(`{"account_id":42}`),
	}}, CapabilityProbeDeps{
		Snapshots: repo, Sidecars: []AdapterSidecar{
			{Adapter: capability.AdapterBrowserConsumer, Client: browser},
			{Adapter: capability.AdapterProtocolIM, Client: protocol},
		}, Tx: probeTx{}, Health: health,
	})
	if err := handler(context.Background(), asynq.NewTask("capability.probe", []byte(`{"outbox_id":"probe-outbox"}`))); err != nil {
		t.Fatalf("probe failed: %v", err)
	}
	if len(repo.snapshots) != len(capability.KnownNames)*2 || health.successes != 2 {
		t.Fatalf("snapshots=%d successes=%d", len(repo.snapshots), health.successes)
	}
	first, err := repo.GetByAccountAndNameAndAdapter(context.Background(), 42, capability.NameMessageTextFirst, capability.AdapterProtocolIM)
	if err != nil || first == nil || first.Status != capability.StatusAvailable {
		t.Fatalf("protocol first-message snapshot=%+v err=%v", first, err)
	}
	existing, err := repo.GetByAccountAndNameAndAdapter(context.Background(), 42, capability.NameMessageTextExisting, capability.AdapterBrowserConsumer)
	if err != nil || existing == nil || existing.Status != capability.StatusAvailable {
		t.Fatalf("browser existing-message snapshot=%+v err=%v", existing, err)
	}
}
