package notification

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

type repositoryStub struct {
	filter       ListFilter
	markedID     uuid.UUID
	markedAllFor int64
}

func (r *repositoryStub) List(_ context.Context, _ int64, filter ListFilter) ([]*Notification, int, error) {
	r.filter = filter
	return []*Notification{{Title: "test", Body: "body"}}, 2, nil
}

func (r *repositoryStub) MarkRead(_ context.Context, _ int64, publicID uuid.UUID) (bool, error) {
	r.markedID = publicID
	return true, nil
}

func (r *repositoryStub) MarkAllRead(_ context.Context, userID int64) (int, error) {
	r.markedAllFor = userID
	return 3, nil
}

func (r *repositoryStub) Create(context.Context, *Notification) error { return nil }

func TestServiceNormalizesListAndMarksRead(t *testing.T) {
	repo := &repositoryStub{}
	svc := NewService(repo)
	items, unread, err := svc.List(context.Background(), 7, ListFilter{UnreadOnly: true, Limit: 500})
	if err != nil || len(items) != 1 || unread != 2 {
		t.Fatalf("List() = %d, %+v, err %v", unread, items, err)
	}
	if repo.filter.Limit != 100 || !repo.filter.UnreadOnly {
		t.Fatalf("filter = %+v", repo.filter)
	}
	id := uuid.New()
	if err := svc.MarkRead(context.Background(), 7, id); err != nil || repo.markedID != id {
		t.Fatalf("MarkRead() err=%v id=%s", err, repo.markedID)
	}
	count, err := svc.MarkAllRead(context.Background(), 7)
	if err != nil || count != 3 || repo.markedAllFor != 7 {
		t.Fatalf("MarkAllRead() = %d, err=%v", count, err)
	}
}

func TestServiceRejectsInvalidUser(t *testing.T) {
	svc := NewService(&repositoryStub{})
	if _, _, err := svc.List(context.Background(), 0, ListFilter{}); err != ErrInvalidUser {
		t.Fatalf("List invalid user error = %v", err)
	}
	if err := svc.MarkRead(context.Background(), 0, uuid.New()); err != ErrInvalidUser {
		t.Fatalf("MarkRead invalid user error = %v", err)
	}
}
