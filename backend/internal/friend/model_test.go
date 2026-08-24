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
	items   []*Friend
	updated []bool
}

func (r *friendRepoStub) ListByAccountOwned(context.Context, int64, uuid.UUID) ([]*Friend, error) {
	return r.items, nil
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
	repo := &friendRepoStub{item: &Friend{ID: 7, PublicID: friendID, SparkEnabled: false, IdentityStatus: IdentityResolved}}
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
	repo := &friendRepoStub{item: &Friend{ID: 8, PublicID: friendID, IdentityStatus: IdentityResolved}}
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

func TestSetSparkEnabledRejectsUnresolvedFriend(t *testing.T) {
	friendID := uuid.New()
	repo := &friendRepoStub{item: &Friend{ID: 9, PublicID: friendID, IdentityStatus: IdentityPending}}
	gate := &gateStub{decision: entitlement.AuthorizationDecision{Allowed: true}}
	service := NewService(repo, gate)

	if _, err := service.SetSparkEnabled(context.Background(), 42, friendID, true); err == nil {
		t.Fatal("unresolved friend should not be enabled")
	} else if app, ok := apperr.As(err); !ok || app.Code != apperr.CodeFriendIdentityUnsolid {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.updated) != 0 {
		t.Fatalf("unresolved friend should not be updated: %v", repo.updated)
	}
}

func TestListPageFallbackTrimsAndResumesWithInternalCursor(t *testing.T) {
	repo := &friendRepoStub{items: []*Friend{{ID: 9}, {ID: 8}, {ID: 7}}}
	service := NewService(repo, &gateStub{})

	first, err := service.ListPageForAccount(context.Background(), 42, uuid.New(), ListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 2 || first.Items[0].ID != 9 || first.Items[1].ID != 8 || first.NextAfterID != 8 {
		t.Fatalf("first page = %+v", first)
	}

	second, err := service.ListPageForAccount(context.Background(), 42, uuid.New(), ListFilter{Limit: 2, AfterID: first.NextAfterID})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.Items[0].ID != 7 || second.NextAfterID != 0 {
		t.Fatalf("second page = %+v", second)
	}
}
