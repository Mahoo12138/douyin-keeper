package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

type SendRepo struct {
	pool *pgxpool.Pool
}

func NewSendRepo(pool *pgxpool.Pool) *SendRepo { return &SendRepo{pool: pool} }

// ---- intents ----

const intentCols = `si.id, si.public_id, si.intent_type, si.request_id, si.task_id, si.account_id,
	si.friend_id, si.local_date::text, si.scheduled_at, si.status, si.error_code, si.next_attempt_at,
	si.last_job_id, si.created_at, si.updated_at`

func scanIntent(row pgx.Row) (*send.SendIntent, error) {
	var in send.SendIntent
	err := row.Scan(&in.ID, &in.PublicID, &in.IntentType, &in.RequestID, &in.TaskID, &in.AccountID,
		&in.FriendID, &in.LocalDate, &in.ScheduledAt, &in.Status, &in.ErrorCode, &in.NextAttemptAt,
		&in.LastJobID, &in.CreatedAt, &in.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &in, nil
}

func (r *SendRepo) CreateIntent(ctx context.Context, in *send.SendIntent) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO send_intents (public_id, intent_type, request_id, task_id, account_id, friend_id,
			local_date, scheduled_at, status, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11)
		RETURNING id
	`, in.PublicID, in.IntentType, in.RequestID, in.TaskID, in.AccountID, in.FriendID,
		in.LocalDate, in.ScheduledAt, in.Status, in.CreatedAt, in.UpdatedAt).Scan(&in.ID)
}

func (r *SendRepo) GetIntentOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*send.SendIntent, error) {
	in, err := scanIntent(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+intentCols+`
		FROM send_intents si
		JOIN douyin_accounts a ON a.id = si.account_id
		WHERE a.user_id = $1 AND si.public_id = $2
	`, userID, publicID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "intent not found")
	}
	return in, nil
}

func (r *SendRepo) ListIntentsByUser(ctx context.Context, userID int64) ([]*send.SendIntent, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+intentCols+`, a.public_id AS account_public_id, f.public_id AS friend_public_id
		FROM send_intents si
		JOIN douyin_accounts a ON a.id = si.account_id
		JOIN friends f ON f.id = si.friend_id
		WHERE a.user_id = $1
		ORDER BY si.id DESC
		LIMIT 100
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*send.SendIntent
	for rows.Next() {
		var in send.SendIntent
		if err := rows.Scan(&in.ID, &in.PublicID, &in.IntentType, &in.RequestID, &in.TaskID, &in.AccountID,
			&in.FriendID, &in.LocalDate, &in.ScheduledAt, &in.Status, &in.ErrorCode, &in.NextAttemptAt,
			&in.LastJobID, &in.CreatedAt, &in.UpdatedAt, &in.AccountPublicID, &in.FriendPublicID); err != nil {
			return nil, err
		}
		out = append(out, &in)
	}
	return out, rows.Err()
}

// ---- jobs ----

const sendJobCols = `j.id, j.public_id, j.intent_id, j.account_id, j.friend_id, j.attempt,
	j.selected_adapter, j.status, j.error_code, j.retryable, j.platform_message_id, j.worker_id,
	j.heartbeat_at, j.lease_expires_at, j.started_at, j.finished_at, j.created_at`

func scanSendJob(row pgx.Row) (*send.SendJob, error) {
	var j send.SendJob
	err := row.Scan(&j.ID, &j.PublicID, &j.IntentID, &j.AccountID, &j.FriendID, &j.Attempt,
		&j.SelectedAdapter, &j.Status, &j.ErrorCode, &j.Retryable, &j.PlatformMessageID, &j.WorkerID,
		&j.HeartbeatAt, &j.LeaseExpiresAt, &j.StartedAt, &j.FinishedAt, &j.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (r *SendRepo) CreateJob(ctx context.Context, j *send.SendJob) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO send_jobs (public_id, intent_id, account_id, friend_id, attempt, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id
	`, j.PublicID, j.IntentID, j.AccountID, j.FriendID, j.Attempt, j.Status, j.CreatedAt).Scan(&j.ID)
}

func (r *SendRepo) GetJobOwned(ctx context.Context, userID int64, publicID uuid.UUID) (*send.SendJob, error) {
	j, err := scanSendJob(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+sendJobCols+`
		FROM send_jobs j
		JOIN douyin_accounts a ON a.id = j.account_id
		WHERE j.public_id = $1 AND a.user_id = $2
	`, publicID, userID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "send job not found")
	}
	return j, nil
}

func (r *SendRepo) SetIntentLastJob(ctx context.Context, intentID, jobID int64) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE send_intents SET last_job_id=$2, updated_at=now() WHERE id=$1`, intentID, jobID)
	return err
}

func (r *SendRepo) CountJobsForIntent(ctx context.Context, intentID int64) (int, error) {
	var n int
	err := From(ctx, r.pool).QueryRow(ctx,
		`SELECT COUNT(*) FROM send_jobs WHERE intent_id=$1`, intentID).Scan(&n)
	return n, err
}

var _ send.Repository = (*SendRepo)(nil)