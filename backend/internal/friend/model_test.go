package friend

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
)

type friendRepoStub struct {
	item    *Friend
	updated []bool
}

func (r *friendRepoStub) ListByAccountOwned(context.Context, int64, uuid.UUID) ([]*Friend, error) {
	return nil, nil
}

func (r *friendRepoStub) GetOwned(context.Context, int64, uuid.UUID) (*Friend, error) {
	return r.item, nil
}

func (r *friendRepoStub) UpdateSparkEnabled(_ context.Context, _ int64, enabled bool) error {
	r.updated = append(r.updated, enabled)
	return nil
}

type gateStub struct {
	decision entitlement.AuthorizationDecision
	calls    int
}

func (g *gateStub) Authorize(context.Context, entitlement.AuthorizationRequest) (entitlement.AuthorizationDecision, error) {
	g.calls++
	return g.decision, nil
}

func TestSetSparkEnabledRequiresEntitlementOnlyWhenEnabling(t *testing.T) {
	friendID := uuid.New()
	repo := &friendRepoStub{item: &Friend{ID: 7, PublicID: friendID, SparkEnabled: false}}
	gate := &gateStub{decision: entitlement.AuthorizationDecision{
		Allowed:    false,
		ReasonCode: apperr.CodeEntitlementExpired,
	}}
	service := NewService(repo, gate)

	if _, err := service.SetSparkEnabled(context.Background(), 42, friendID, true); err == nil {
		t.Fatal("enabling spark maintenance without entitlement should fail")
	} else if app, ok := apperr.As(err); !ok || app.Code != apperr.CodeEntitlementExpired {
		t.Fatalf("unexpected error: %v", err)
	}
	if gate.calls != 1 || len(repo.updated) != 0 {
		t.Fatalf("denied enable should authorize once and not update: gate=%d updates=%v", gate.calls, repo.updated)
	}

	got, err := service.SetSparkEnabled(context.Background(), 42, friendID, false)
	if err != nil {
		t.Fatal(err)
	}
	if got != repo.item || got.SparkEnabled || gate.calls != 1 {
		t.Fatalf("disabling should update without another entitlement check: friend=%+v gate=%d", got, gate.calls)
	}
	if len(repo.updated) != 1 || repo.updated[0] {
		t.Fatalf("expected one disabled update, got %v", repo.updated)
	}
}

func TestSetSparkEnabledUpdatesResolvedFriendAfterAuthorization(t *testing.T) {
	friendID := uuid.New()
	repo := &friendRepoStub{item: &Friend{ID: 8, PublicID: friendID}}
	gate := &gateStub{decision: entitlement.AuthorizationDecision{Allowed: true}}
	service := NewService(repo, gate)

	got, err := service.SetSparkEnabled(context.Background(), 42, friendID, true)
	if err != nil {
		t.Fatal(err)
	}
	if !got.SparkEnabled || gate.calls != 1 || len(repo.updated) != 1 || !repo.updated[0] {
		t.Fatalf("expected authorized enable update: friend=%+v gate=%d updates=%v", got, gate.calls, repo.updated)
	}
}
