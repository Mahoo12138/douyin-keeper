package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

type JobRepo struct {
	pool *pgxpool.Pool
}

func NewJobRepo(pool *pgxpool.Pool) *JobRepo { return &JobRepo{pool: pool} }

const jobCols = `id, public_id, user_id, account_id, type, status, error_code, cancelable,
	cancel_requested_at, worker_id, heartbeat_at, lease_expires_at, created_at, started_at, finished_at`

func scanJob(row pgx.Row) (*job.Job, error) {
	var j job.Job
	err := row.Scan(&j.ID, &j.PublicID, &j.UserID, &j.AccountID, &j.Type, &j.Status, &j.ErrorCode,
		&j.Cancelable, &j.CancelRequestedAt, &j.WorkerID, &j.HeartbeatAt, &j.LeaseExpiresAt,
		&j.CreatedAt, &j.StartedAt, &j.FinishedAt)
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (r *JobRepo) CreateJob(ctx context.Context, j *job.Job) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO jobs (public_id, user_id, account_id, type, status, cancelable, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id
	`, j.PublicID, j.UserID, j.AccountID, j.Type, j.Status, j.Cancelable, j.CreatedAt).Scan(&j.ID)
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

func (r *JobRepo) Finish(ctx context.Context, jobID int64, status job.Status, errorCode *string, at time.Time) error {
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE jobs SET status=$2, error_code=$3, finished_at=$4,
			heartbeat_at=NULL, lease_expires_at=NULL WHERE id=$1`, jobID, status, errorCode, at)
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
	_, err := From(ctx, r.pool).Exec(ctx, `
		UPDATE jobs SET cancel_requested_at=$2 WHERE id=$1 AND cancelable`, jobID, at)
	return err
}

var _ job.Repository = (*JobRepo)(nil)
