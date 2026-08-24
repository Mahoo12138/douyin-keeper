package messagetemplate

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type repositoryStub struct {
	item    *Template
	created *Template
	updated *Template
	deleted int64
	filter  ListFilter
}

func (r *repositoryStub) ListByUser(_ context.Context, _ int64, filter ListFilter) ([]*Template, error) {
	r.filter = filter
	return []*Template{r.item}, nil
}
func (r *repositoryStub) GetOwned(context.Context, int64, uuid.UUID) (*Template, error) {
	return r.item, nil
}
func (r *repositoryStub) Create(_ context.Context, item *Template) error {
	r.created = item
	return nil
}
func (r *repositoryStub) Update(_ context.Context, item *Template) error {
	r.updated = item
	return nil
}
func (r *repositoryStub) SoftDelete(_ context.Context, id int64) error { r.deleted = id; return nil }

func TestServiceCreatesNormalizedTemplate(t *testing.T) {
	repo := &repositoryStub{}
	svc := NewService(repo)
	svc.now = func() time.Time { return time.Date(2026, 8, 24, 9, 0, 0, 0, time.UTC) }
	item, err := svc.Create(context.Background(), 7, CreateInput{Name: " 晚安 ", Kind: KindText, Body: " 今天也续火花  "})
	if err != nil {
		t.Fatal(err)
	}
	if item.Name != "晚安" || item.Body != "今天也续火花" || item.UserID != 7 || repo.created != item {
		t.Fatalf("created template = %+v", item)
	}
}

func TestServiceRejectsInvalidTemplateAndClampsPatchToValidState(t *testing.T) {
	svc := NewService(&repositoryStub{})
	for _, input := range []CreateInput{{Name: "", Kind: KindText, Body: "hello"}, {Name: "x", Kind: "image", Body: "hello"}, {Name: "x", Kind: KindText, Body: ""}} {
		if _, err := svc.Create(context.Background(), 7, input); err == nil {
			t.Fatalf("input %+v should be rejected", input)
		}
	}
	repo := &repositoryStub{item: &Template{ID: 19, PublicID: uuid.New(), Name: "old", Kind: KindText, Body: "hello"}}
	svc = NewService(repo)
	name := " new "
	body := " updated "
	item, err := svc.Update(context.Background(), 7, repo.item.PublicID, Patch{Name: &name, Body: &body})
	if err != nil || item.Name != "new" || item.Body != "updated" || repo.updated != item {
		t.Fatalf("updated template = %+v, err=%v", item, err)
	}
	if err := svc.Delete(context.Background(), 7, repo.item.PublicID); err != nil || repo.deleted != 19 {
		t.Fatalf("delete = %d, err=%v", repo.deleted, err)
	}
}

func TestServiceValidatesListKind(t *testing.T) {
	repo := &repositoryStub{item: &Template{PublicID: uuid.New()}}
	svc := NewService(repo)
	if _, err := svc.ListForUser(context.Background(), 7, ListFilter{Kind: "image"}); err == nil {
		t.Fatal("invalid kind should be rejected")
	}
	if _, err := svc.ListForUser(context.Background(), 7, ListFilter{Kind: KindSticker}); err != nil || repo.filter.Kind != KindSticker {
		t.Fatalf("list filter = %+v, err=%v", repo.filter, err)
	}
}
