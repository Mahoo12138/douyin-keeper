package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/messagetemplate"
)

type MessageTemplateRepo struct {
	pool *pgxpool.Pool
}

func NewMessageTemplateRepo(pool *pgxpool.Pool) *MessageTemplateRepo {
	return &MessageTemplateRepo{pool: pool}
}

const messageTemplateCols = `id, public_id, user_id, name, kind, body, created_at, updated_at, deleted_at`

func scanMessageTemplate(row pgx.Row) (*messagetemplate.Template, error) {
	item := new(messagetemplate.Template)
	err := row.Scan(&item.ID, &item.PublicID, &item.UserID, &item.Name, &item.Kind, &item.Body, &item.CreatedAt, &item.UpdatedAt, &item.DeletedAt)
	return item, err
}

func (r *MessageTemplateRepo) ListByUser(ctx context.Context, userID int64, filter messagetemplate.ListFilter) ([]*messagetemplate.Template, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+messageTemplateCols+` FROM message_templates
		WHERE user_id=$1 AND deleted_at IS NULL
		  AND ($2 = '' OR kind=$2)
		ORDER BY updated_at DESC, id DESC`, userID, filter.Kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*messagetemplate.Template, 0)
	for rows.Next() {
		item, err := scanMessageTemplate(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *MessageTemplateRepo) ListByUserPage(ctx context.Context, userID int64, filter messagetemplate.ListFilter) ([]*messagetemplate.Template, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+messageTemplateCols+` FROM message_templates
		WHERE user_id=$1 AND deleted_at IS NULL
		  AND ($2 = '' OR kind=$2)
		  AND ($3::timestamptz IS NULL OR (updated_at,id) < ($3::timestamptz,$4::bigint))
		ORDER BY updated_at DESC, id DESC
		LIMIT $5`, userID, filter.Kind, filter.AfterUpdatedAt, filter.AfterID, filter.Limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*messagetemplate.Template, 0, filter.Limit+1)
	for rows.Next() {
		item, err := scanMessageTemplate(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *MessageTemplateRepo) GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*messagetemplate.Template, error) {
	item, err := scanMessageTemplate(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+messageTemplateCols+` FROM message_templates
		WHERE public_id=$1 AND user_id=$2 AND deleted_at IS NULL`, publicID, userID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "message template not found")
	}
	return item, nil
}

func (r *MessageTemplateRepo) Create(ctx context.Context, item *messagetemplate.Template) error {
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO message_templates (public_id, user_id, name, kind, body, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, item.PublicID, item.UserID, item.Name, item.Kind, item.Body, item.CreatedAt, item.UpdatedAt).Scan(&item.ID)
	if isUniqueViolation(err) {
		return apperr.Conflict(apperr.CodeConflict, "template name already exists")
	}
	return err
}

func (r *MessageTemplateRepo) Update(ctx context.Context, item *messagetemplate.Template) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE message_templates SET name=$2, kind=$3, body=$4, updated_at=$5
		WHERE id=$1 AND deleted_at IS NULL`, item.ID, item.Name, item.Kind, item.Body, item.UpdatedAt)
	if isUniqueViolation(err) {
		return apperr.Conflict(apperr.CodeConflict, "template name already exists")
	}
	return err
}

func (r *MessageTemplateRepo) SoftDelete(ctx context.Context, id int64) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE message_templates SET deleted_at=now(), updated_at=now()
		WHERE id=$1 AND deleted_at IS NULL`, id)
	return err
}

var _ messagetemplate.Repository = (*MessageTemplateRepo)(nil)
var _ messagetemplate.PageRepository = (*MessageTemplateRepo)(nil)
