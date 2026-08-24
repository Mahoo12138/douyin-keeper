// Package messagetemplate owns reusable user-authored message snippets.
// Applying a template to a task copies its current content; tasks remain
// independently auditable and are not changed by later template edits.
package messagetemplate

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

const (
	KindText    = "text"
	KindSticker = "sticker"
	MaxName     = 80
	MaxBody     = 500
)

type Template struct {
	ID        int64
	PublicID  uuid.UUID
	UserID    int64
	Name      string
	Kind      string
	Body      string
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt *time.Time
}

type ListFilter struct {
	Kind           string
	Limit          int
	AfterUpdatedAt *time.Time
	AfterID        int64
}

type ListPage struct {
	Items         []*Template
	NextUpdatedAt *time.Time
	NextAfterID   int64
}

type CreateInput struct {
	Name string
	Kind string
	Body string
}

type Patch struct {
	Name *string
	Kind *string
	Body *string
}

type Repository interface {
	ListByUser(ctx context.Context, userID int64, filter ListFilter) ([]*Template, error)
	GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*Template, error)
	Create(ctx context.Context, item *Template) error
	Update(ctx context.Context, item *Template) error
	SoftDelete(ctx context.Context, id int64) error
}

// PageRepository is the API-facing cursor projection. The legacy list method
// remains available for callers that need the complete template snapshot.
type PageRepository interface {
	ListByUserPage(ctx context.Context, userID int64, filter ListFilter) ([]*Template, error)
}

type Service struct {
	repo Repository
	now  func() time.Time
}

func NewService(repo Repository) *Service { return &Service{repo: repo, now: time.Now} }

func (s *Service) ListForUser(ctx context.Context, userID int64, filter ListFilter) ([]*Template, error) {
	if err := validateListFilter(filter); err != nil {
		return nil, err
	}
	return s.repo.ListByUser(ctx, userID, filter)
}

func (s *Service) ListPageForUser(ctx context.Context, userID int64, filter ListFilter) (ListPage, error) {
	if err := validateListFilter(filter); err != nil {
		return ListPage{}, err
	}
	filter = normalizeListFilter(filter)
	if repo, ok := s.repo.(PageRepository); ok {
		items, err := repo.ListByUserPage(ctx, userID, filter)
		if err != nil {
			return ListPage{}, err
		}
		return trimListPage(items, filter.Limit), nil
	}
	items, err := s.repo.ListByUser(ctx, userID, filter)
	if err != nil {
		return ListPage{}, err
	}
	if filter.AfterUpdatedAt != nil && filter.AfterID > 0 {
		start := len(items)
		for index, item := range items {
			if item != nil && (item.UpdatedAt.Before(*filter.AfterUpdatedAt) ||
				(item.UpdatedAt.Equal(*filter.AfterUpdatedAt) && item.ID < filter.AfterID)) {
				start = index
				break
			}
		}
		if start < len(items) {
			items = items[start:]
		} else {
			items = nil
		}
	}
	return trimListPage(items, filter.Limit), nil
}

func validateListFilter(filter ListFilter) error {
	if filter.Kind != "" && filter.Kind != KindText && filter.Kind != KindSticker {
		return apperr.Validation(apperr.CodeConflict, "invalid template kind")
	}
	return nil
}

func normalizeListFilter(filter ListFilter) ListFilter {
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 100 {
		filter.Limit = 100
	}
	if filter.AfterID < 0 {
		filter.AfterID = 0
	}
	return filter
}

func trimListPage(items []*Template, limit int) ListPage {
	page := ListPage{Items: items}
	if len(items) <= limit {
		return page
	}
	page.Items = items[:limit]
	if last := page.Items[len(page.Items)-1]; last != nil && last.ID > 0 && !last.UpdatedAt.IsZero() {
		updatedAt := last.UpdatedAt
		page.NextUpdatedAt = &updatedAt
		page.NextAfterID = last.ID
	}
	return page
}

func (s *Service) Create(ctx context.Context, userID int64, input CreateInput) (*Template, error) {
	name, kind, body, err := normalize(input.Name, input.Kind, input.Body)
	if err != nil {
		return nil, err
	}
	now := s.now()
	item := &Template{PublicID: uuid.New(), UserID: userID, Name: name, Kind: kind, Body: body, CreatedAt: now, UpdatedAt: now}
	if err := s.repo.Create(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Update(ctx context.Context, userID int64, publicID uuid.UUID, patch Patch) (*Template, error) {
	item, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return nil, err
	}
	if patch.Name != nil {
		item.Name = strings.TrimSpace(*patch.Name)
	}
	if patch.Kind != nil {
		item.Kind = strings.TrimSpace(*patch.Kind)
	}
	if patch.Body != nil {
		item.Body = strings.TrimSpace(*patch.Body)
	}
	name, kind, body, err := normalize(item.Name, item.Kind, item.Body)
	if err != nil {
		return nil, err
	}
	item.Name, item.Kind, item.Body = name, kind, body
	item.UpdatedAt = s.now()
	if err := s.repo.Update(ctx, item); err != nil {
		return nil, err
	}
	return item, nil
}

func (s *Service) Delete(ctx context.Context, userID int64, publicID uuid.UUID) error {
	item, err := s.repo.GetOwned(ctx, userID, publicID)
	if err != nil {
		return err
	}
	return s.repo.SoftDelete(ctx, item.ID)
}

func normalize(name, kind, body string) (string, string, string, error) {
	name, kind, body = strings.TrimSpace(name), strings.TrimSpace(kind), strings.TrimSpace(body)
	if name == "" || len([]rune(name)) > MaxName {
		return "", "", "", apperr.Validation(apperr.CodeConflict, "template name must be 1-80 characters")
	}
	if kind != KindText && kind != KindSticker {
		return "", "", "", apperr.Validation(apperr.CodeConflict, "template kind must be text or sticker")
	}
	if body == "" || len([]rune(body)) > MaxBody {
		return "", "", "", apperr.Validation(apperr.CodeConflict, "template body must be 1-500 characters")
	}
	return name, kind, body, nil
}
