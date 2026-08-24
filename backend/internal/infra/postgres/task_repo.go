package postgres

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/task"
)

type TaskRepo struct {
	pool *pgxpool.Pool
}

func NewTaskRepo(pool *pgxpool.Pool) *TaskRepo { return &TaskRepo{pool: pool} }

const taskCols = `t.id, t.public_id, t.user_id, t.account_id, t.friend_id, t.enabled, t.timezone,
	to_char(t.window_start, 'HH24:MI:SS'), to_char(t.window_end, 'HH24:MI:SS'),
	t.message_kind, t.message_body, t.allow_first_message, t.created_at, t.updated_at, t.deleted_at,
	a.public_id, f.public_id`

func scanTask(row pgx.Row) (*task.SparkTask, error) {
	var t task.SparkTask
	err := row.Scan(&t.ID, &t.PublicID, &t.UserID, &t.AccountID, &t.FriendID, &t.Enabled, &t.Timezone,
		&t.WindowStart, &t.WindowEnd, &t.MessageKind, &t.MessageBody, &t.AllowFirstMessage,
		&t.CreatedAt, &t.UpdatedAt, &t.DeletedAt, &t.AccountPublicID, &t.FriendPublicID)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TaskRepo) ListByUser(ctx context.Context, userID int64) ([]*task.SparkTask, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+taskCols+` FROM spark_tasks t
		JOIN douyin_accounts a ON a.id = t.account_id
		JOIN friends f ON f.id = t.friend_id
		WHERE t.user_id=$1 AND t.deleted_at IS NULL AND a.deleted_at IS NULL
		ORDER BY t.id DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*task.SparkTask
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *TaskRepo) GetByID(ctx context.Context, taskID int64) (*task.SparkTask, error) {
	t, err := scanTask(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+taskCols+` FROM spark_tasks t
		JOIN douyin_accounts a ON a.id = t.account_id
		JOIN friends f ON f.id = t.friend_id
		WHERE t.id=$1 AND t.deleted_at IS NULL AND a.deleted_at IS NULL`, taskID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "task not found")
	}
	return t, nil
}

// ListDue returns enabled tasks whose local wall clock is inside the current
// window. Account/friend state is only a coarse prefilter; the scheduler
// transaction performs the entitlement and quota checks before creating an
// intent (docs/15 §3.1).
func (r *TaskRepo) ListDue(ctx context.Context, now time.Time, limit int) ([]*task.SparkTask, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+taskCols+` FROM spark_tasks t
		JOIN douyin_accounts a ON a.id = t.account_id
		JOIN friends f ON f.id = t.friend_id AND f.account_id = t.account_id
		WHERE t.enabled
		  AND t.deleted_at IS NULL
		  AND a.deleted_at IS NULL
		  AND f.deleted_at IS NULL
		  AND f.identity_status = 'resolved'
		  AND a.binding_status = 'bound'
		  AND a.risk_status = 'normal'
		  AND a.session_status IN ('unknown','valid')
		  AND (($1::timestamptz AT TIME ZONE t.timezone)::time >= t.window_start)
		  AND (($1::timestamptz AT TIME ZONE t.timezone)::time < t.window_end)
		ORDER BY t.id
		LIMIT $2`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*task.SparkTask
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *TaskRepo) GetOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*task.SparkTask, error) {
	t, err := scanTask(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+taskCols+` FROM spark_tasks t
		JOIN douyin_accounts a ON a.id = t.account_id
		JOIN friends f ON f.id = t.friend_id
		WHERE t.public_id=$1 AND t.user_id=$2 AND t.deleted_at IS NULL AND a.deleted_at IS NULL`, publicID, userID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "task not found")
	}
	return t, nil
}

func (r *TaskRepo) Create(ctx context.Context, t *task.SparkTask) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO spark_tasks (public_id, user_id, account_id, friend_id, enabled, timezone,
			window_start, window_end, message_kind, message_body, allow_first_message, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7::time,$8::time,$9,$10,$11,$12,$13)
		RETURNING id
	`, t.PublicID, t.UserID, t.AccountID, t.FriendID, t.Enabled, t.Timezone,
		t.WindowStart, t.WindowEnd, t.MessageKind, t.MessageBody, t.AllowFirstMessage,
		t.CreatedAt, t.UpdatedAt).Scan(&t.ID)
}

func (r *TaskRepo) Update(ctx context.Context, t *task.SparkTask) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE spark_tasks SET
			enabled=$2, timezone=$3, window_start=$4::time, window_end=$5::time,
			message_kind=$6, message_body=$7, allow_first_message=$8, updated_at=$9
		WHERE id=$1 AND deleted_at IS NULL
	`, t.ID, t.Enabled, t.Timezone, t.WindowStart, t.WindowEnd,
		t.MessageKind, t.MessageBody, t.AllowFirstMessage, t.UpdatedAt)
	return err
}

func (r *TaskRepo) SoftDelete(ctx context.Context, id int64) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE spark_tasks SET deleted_at=now(), updated_at=now() WHERE id=$1`, id)
	return err
}

func (r *TaskRepo) CountTasks(ctx context.Context, userID int64) (int, error) {
	var n int
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT COUNT(*) FROM spark_tasks WHERE user_id=$1 AND deleted_at IS NULL`, userID).Scan(&n)
	return n, err
}

var _ task.Repository = (*TaskRepo)(nil)
