package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type JobRepo struct {
	pool *pgxpool.Pool
}

func NewJobRepo(pool *pgxpool.Pool) *JobRepo { return &JobRepo{pool: pool} }

const jobCols = `id, public_id, user_id, account_id, type, status, error_code, cancelable,
	idempotency_key, idempotency_scope, cancel_requested_at, worker_id, heartbeat_at,
	lease_expires_at, created_at, started_at, finished_at`

func scanJob(row pgx.Row) (*job.Job, error) {
	var j job.Job
	err := row.Scan(&j.ID, &j.PublicID, &j.UserID, &j.AccountID, &j.Type, &j.Status, &j.ErrorCode,
		&j.Cancelable, &j.IdempotencyKey, &j.IdempotencyScope, &j.CancelRequestedAt, &j.WorkerID, &j.HeartbeatAt, &j.LeaseExpiresAt,
		&j.CreatedAt, &j.StartedAt, &j.FinishedAt)
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (r *JobRepo) CreateJob(ctx context.Context, j *job.Job) error {
	err := From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO jobs (public_id, user_id, account_id, type, idempotency_key, idempotency_scope, status, cancelable, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id
	`, j.PublicID, j.UserID, j.AccountID, j.Type, j.IdempotencyKey, j.IdempotencyScope, j.Status, j.Cancelable, j.CreatedAt).Scan(&j.ID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.ConstraintName == "ux_jobs_user_idempotency_key" {
			return fmt.Errorf("%w: %v", job.ErrIdempotencyConflict, err)
		}
	}
	return err
}

// GetByIdempotency returns the user's previous durable job for a request key.
// A missing key is deliberately represented as (nil, nil) so callers can
// distinguish a first request from a database failure.
func (r *JobRepo) GetByIdempotency(ctx context.Context, userID int64, key string) (*job.Job, error) {
	j, err := scanJob(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+jobCols+` FROM jobs
		WHERE user_id=$1 AND idempotency_key=$2`, userID, key))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return j, err
}

func (r *JobRepo) GetOwned(ctx context.Context, userID *int64, publicID uuid.UUID) (*job.Job, error) {
	// Admin (userID == nil) may read any job; C-side always scopes by user.
	where := `public_id=$1`
	args := []any{publicID}
	if userID != nil {
		where += ` AND user_id=$2`
		args = append(args, *userID)
	}
	j, err := scanJob(From(ctx, r.pool).QueryRow(ctx, `
		SELECT `+jobCols+` FROM jobs WHERE `+where, args...))
	if err != nil {
		return nil, mapNoRows(err, apperr.CodeNotFound, "job not found")
	}
	return j, nil
}

func (r *JobRepo) Claim(ctx context.Context, publicID uuid.UUID, workerID string, lease time.Duration) (*job.Job, error) {
	j, err := scanJob(From(ctx, r.pool).QueryRow(ctx, `
		UPDATE jobs SET status='running', worker_id=$2,
			started_at=COALESCE(started_at, now()), heartbeat_at=now(),
			lease_expires_at=now()+make_interval(secs => $3)
		WHERE public_id=$1 AND status='queued'
		RETURNING `+jobCols, publicID, workerID, lease.Seconds()))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return j, err
}

func (r *JobRepo) Heartbeat(ctx context.Context, jobID int64, workerID string, lease time.Duration) error {
	if lease <= 0 {
		lease = 2 * time.Minute
	}
	tag, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE jobs SET heartbeat_at=now(), lease_expires_at=now()+make_interval(secs => $3)
		WHERE id=$1 AND status IN ('running','waiting_user') AND worker_id=$2`, jobID, workerID, lease.Seconds())
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return pgx.ErrNoRows
	}
	return nil
}

func (r *JobRepo) Finish(ctx context.Context, jobID int64, status job.Status, errorCode *string, at time.Time) error {
	tag, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE jobs SET status=$2, error_code=$3, finished_at=$4,
			heartbeat_at=NULL, lease_expires_at=NULL
		WHERE id=$1 AND status IN ('running','waiting_user')`, jobID, status, errorCode, at)
	if err == nil && tag.RowsAffected() != 1 {
		return pgx.ErrNoRows
	}
	return err
}

func (r *JobRepo) IsCancelRequested(ctx context.Context, jobID int64) (bool, error) {
	var requested bool
	err := From(ctx, r.pool).QueryRow(ctx, `
		SELECT cancel_requested_at IS NOT NULL FROM jobs WHERE id=$1`, jobID).Scan(&requested)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, apperr.New(apperr.CodeNotFound, apperr.KindNotFound, "job not found")
	}
	return requested, err
}

func (r *JobRepo) MarkWaiting(ctx context.Context, jobID int64, lease time.Duration) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE jobs SET status='waiting_user', heartbeat_at=now(),
			lease_expires_at=now()+make_interval(secs => $2)
		WHERE id=$1 AND status IN ('running','waiting_user')`, jobID, lease.Seconds())
	return err
}

func (r *JobRepo) ListEvents(ctx context.Context, jobID int64) ([]job.JobEvent, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT seq, event_type, payload_json, created_at FROM job_events
		WHERE job_id=$1 ORDER BY seq`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []job.JobEvent
	for rows.Next() {
		var e job.JobEvent
		if err := rows.Scan(&e.Seq, &e.EventType, &e.Payload, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *JobRepo) AppendEvent(ctx context.Context, jobID int64, e job.JobEvent) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO job_events (job_id, seq, event_type, payload_json)
		SELECT $1, COALESCE(MAX(seq), 0) + 1, $2, $3 FROM job_events WHERE job_id = $1
	`, jobID, e.EventType, e.Payload)
	return err
}

func (r *JobRepo) RequestCancel(ctx context.Context, jobID int64, at time.Time) error {
	tag, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE jobs SET cancel_requested_at=COALESCE(cancel_requested_at, $2)
		WHERE id=$1 AND cancelable AND status IN ('queued','running','waiting_user')`, jobID, at)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return apperr.Conflict(apperr.CodeConflict, "job is no longer cancelable")
	}
	return nil
}

// FindExpiredLeases returns generic jobs whose worker lease expired while the
// job was running or waiting for user input. The row lock keeps a scheduler
// reaper batch stable until its surrounding transaction finishes.
func (r *JobRepo) FindExpiredLeases(ctx context.Context, at time.Time, limit int) ([]*job.Job, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+jobCols+` FROM jobs
		WHERE status IN ('running','waiting_user')
		  AND lease_expires_at IS NOT NULL AND lease_expires_at < $1
		ORDER BY lease_expires_at, id
		LIMIT $2
		FOR UPDATE SKIP LOCKED`, at, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*job.Job, 0)
	for rows.Next() {
		var item job.Job
		if err := rows.Scan(&item.ID, &item.PublicID, &item.UserID, &item.AccountID, &item.Type,
			&item.Status, &item.ErrorCode, &item.Cancelable, &item.IdempotencyKey, &item.IdempotencyScope, &item.CancelRequestedAt,
			&item.WorkerID, &item.HeartbeatAt, &item.LeaseExpiresAt, &item.CreatedAt,
			&item.StartedAt, &item.FinishedAt); err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, rows.Err()
}

// FinishExpired closes a still-expired job conditionally. It prevents a late
// reaper from overwriting a worker that renewed or completed the job after the
// scan, even when the caller is not holding the original row lock.
func (r *JobRepo) FinishExpired(ctx context.Context, jobID int64, status job.Status, errorCode *string, at time.Time) (bool, error) {
	tag, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE jobs SET status=$2, error_code=$3, finished_at=$4,
			heartbeat_at=NULL, lease_expires_at=NULL
		WHERE id=$1 AND status IN ('running','waiting_user')
		  AND lease_expires_at IS NOT NULL AND lease_expires_at < $4`,
		jobID, status, errorCode, at)
	return tag.RowsAffected() == 1, err
}

var _ job.Repository = (*JobRepo)(nil)
