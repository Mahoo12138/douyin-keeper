package conversation

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

type repositoryStub struct {
	filter ListFilter
}

func (r *repositoryStub) ListByAccountOwned(_ context.Context, _ int64, _ uuid.UUID, filter ListFilter) ([]*Conversation, error) {
	r.filter = filter
	return []*Conversation{{ID: uuid.New(), Channel: "consumer"}}, nil
}

func TestServiceClampsListLimit(t *testing.T) {
	repo := &repositoryStub{}
	svc := NewService(repo)
	if items, err := svc.ListForAccount(context.Background(), 7, uuid.New(), ListFilter{Limit: 500}); err != nil || len(items) != 1 {
		t.Fatalf("ListForAccount() = %+v, %v", items, err)
	}
	if repo.filter.Limit != 100 {
		t.Fatalf("limit = %d, want 100", repo.filter.Limit)
	}
	if _, err := svc.ListForAccount(context.Background(), 7, uuid.New(), ListFilter{}); err != nil {
		t.Fatal(err)
	}
	if repo.filter.Limit != 100 {
		t.Fatalf("default limit = %d, want 100", repo.filter.Limit)
	}
}
