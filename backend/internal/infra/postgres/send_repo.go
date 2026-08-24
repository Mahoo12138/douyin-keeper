package postgres

import (
	"context"
	"time"

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

// CreateScheduledIntent inserts one daily scheduled intent. The partial
// unique index absorbs duplicate scheduler ticks, so callers only reserve
// quota after this method reports inserted=true.
func (r *SendRepo) CreateScheduledIntent(ctx context.Context, in *send.SendIntent) (bool, error) {
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO send_intents (public_id, intent_type, task_id, account_id, friend_id,
			local_date, scheduled_at, status, created_at, updated_at)
		VALUES ($1,'scheduled',$2,$3,$4,$5::date,$6,$7,$8,$9)
		ON CONFLICT DO NOTHING
		RETURNING id
	`, in.PublicID, in.TaskID, in.AccountID, in.FriendID, in.LocalDate,
		in.ScheduledAt, in.Status, in.CreatedAt, in.UpdatedAt).Scan(&in.ID)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	return err == nil, err
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

func (r *SendRepo) GetIntentByPublicID(ctx context.Context, publicID uuid.UUID) (*send.SendIntent, error) {
	in, err := scanIntent(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+intentCols+` FROM send_intents si WHERE si.public_id=$1`, publicID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "intent not found")
	}
	return in, nil
}

func (r *SendRepo) GetIntentByID(ctx context.Context, intentID int64) (*send.SendIntent, error) {
	in, err := scanIntent(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+intentCols+` FROM send_intents si WHERE si.id=$1`, intentID))
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

const sendJobReturnCols = `id, public_id, intent_id, account_id, friend_id, attempt,
	selected_adapter, status, error_code, retryable, platform_message_id, worker_id,
	heartbeat_at, lease_expires_at, started_at, finished_at, created_at`

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

func (r *SendRepo) GetJobByPublicID(ctx context.Context, publicID uuid.UUID) (*send.SendJob, error) {
	j, err := scanSendJob(From(ctx, r.pool).QueryRow(ctx,
		`SELECT `+sendJobCols+` FROM send_jobs j WHERE j.public_id=$1`, publicID))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "send job not found")
	}
	return j, nil
}

func (r *SendRepo) ClaimJob(ctx context.Context, publicID uuid.UUID, workerID string, lease time.Duration) (*send.SendJob, error) {
	j, err := scanSendJob(From(ctx, r.pool).QueryRow(ctx, `
		UPDATE send_jobs SET status='running', worker_id=$2, started_at=COALESCE(started_at, now()),
			heartbeat_at=now(), lease_expires_at=now()+make_interval(secs => $3)
		WHERE public_id=$1 AND status='queued'
		RETURNING `+sendJobReturnCols, publicID, workerID, lease.Seconds()))
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return j, err
}

func (r *SendRepo) FinishJob(ctx context.Context, jobID int64, status send.JobStatus, errorCode *string, retryable bool, platformMessageID *string, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE send_jobs SET status=$2, error_code=$3, retryable=$4, platform_message_id=$5,
			finished_at=$6, heartbeat_at=NULL, lease_expires_at=NULL WHERE id=$1`,
		jobID, status, errorCode, retryable, platformMessageID, at)
	return err
}

func (r *SendRepo) SetIntentStatus(ctx context.Context, intentID int64, status send.IntentStatus, errorCode *string, nextAttemptAt *time.Time, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE send_intents SET status=$2, error_code=$3, next_attempt_at=$4, updated_at=$5 WHERE id=$1`,
		intentID, status, errorCode, nextAttemptAt, at)
	return err
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
