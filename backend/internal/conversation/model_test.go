package conversation

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type repositoryStub struct {
	filter   ListFilter
	archived bool
}

func (r *repositoryStub) ListByAccountOwned(_ context.Context, _ int64, _ uuid.UUID, filter ListFilter) ([]*Conversation, error) {
	r.filter = filter
	return []*Conversation{{ID: uuid.New()}}, nil
}

func (r *repositoryStub) ListByAccountOwnedPage(_ context.Context, _ int64, _ uuid.UUID, filter ListFilter) ([]*Conversation, error) {
	r.filter = filter
	return []*Conversation{{InternalID: 3}, {InternalID: 2}, {InternalID: 1}}, nil
}

func (r *repositoryStub) SetArchived(_ context.Context, _ int64, _, _ uuid.UUID, archived bool, at time.Time) (*Conversation, error) {
	r.archived = archived
	return &Conversation{ArchivedAt: func() *time.Time {
		if archived {
			return &at
		}
		return nil
	}()}, nil
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

func TestServiceSetsConversationArchiveState(t *testing.T) {
	repo := &repositoryStub{}
	svc := NewService(repo)
	item, err := svc.SetArchived(context.Background(), 7, uuid.New(), uuid.New(), true)
	if err != nil || item == nil || item.ArchivedAt == nil || !repo.archived {
		t.Fatalf("SetArchived() = %+v, err=%v", item, err)
	}
	if _, err := svc.SetArchived(context.Background(), 0, uuid.New(), uuid.New(), true); err == nil {
		t.Fatal("invalid user should be rejected")
	}
}

func TestServiceListsConversationCursorPage(t *testing.T) {
	repo := &repositoryStub{}
	svc := NewService(repo)
	page, err := svc.ListPageForAccount(context.Background(), 7, uuid.New(), ListFilter{Limit: 2, AfterID: 3, IncludeArchived: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 || page.Items[0].InternalID != 3 || page.Items[1].InternalID != 2 || page.NextAfterID != 2 {
		t.Fatalf("page = %+v", page)
	}
	if repo.filter.Limit != 2 || repo.filter.AfterID != 3 || !repo.filter.IncludeArchived {
		t.Fatalf("filter = %+v", repo.filter)
	}
}

func TestServiceNormalizesConversationCursorLimit(t *testing.T) {
	repo := &repositoryStub{}
	svc := NewService(repo)
	if _, err := svc.ListPageForAccount(context.Background(), 7, uuid.New(), ListFilter{Limit: 500}); err != nil {
		t.Fatal(err)
	}
	if repo.filter.Limit != 100 {
		t.Fatalf("limit = %d, want 100", repo.filter.Limit)
	}
}
