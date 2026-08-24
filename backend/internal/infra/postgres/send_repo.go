package postgres

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/send"
)

type SendRepo struct {
	pool *pgxpool.Pool
}

func NewSendRepo(pool *pgxpool.Pool) *SendRepo { return &SendRepo{pool: pool} }

type rowScanner interface {
	Scan(dest ...any) error
}

// ---- intents ----

const intentCols = `si.id, si.public_id, si.intent_type, si.request_id, si.task_id, si.account_id,
	si.friend_id, si.local_date::text, si.scheduled_at, si.status, si.error_code, si.next_attempt_at,
	si.last_job_id, si.created_at, si.updated_at`

func intentScanArgs(in *send.SendIntent) []any {
	return []any{&in.ID, &in.PublicID, &in.IntentType, &in.RequestID, &in.TaskID, &in.AccountID,
		&in.FriendID, &in.LocalDate, &in.ScheduledAt, &in.Status, &in.ErrorCode, &in.NextAttemptAt,
		&in.LastJobID, &in.CreatedAt, &in.UpdatedAt}
}

func scanIntent(row rowScanner) (*send.SendIntent, error) {
	var in send.SendIntent
	err := row.Scan(intentScanArgs(&in)...)
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

func (r *SendRepo) ListIntentsByUser(ctx context.Context, userID int64, filter send.IntentListFilter) ([]*send.SendIntent, error) {
	return r.listIntentsByUser(ctx, userID, filter, 100, 0)
}

func (r *SendRepo) ListIntentsByUserPage(ctx context.Context, userID int64, filter send.IntentListFilter) ([]*send.SendIntent, error) {
	return r.listIntentsByUser(ctx, userID, filter, filter.Limit+1, filter.AfterID)
}

func (r *SendRepo) listIntentsByUser(ctx context.Context, userID int64, filter send.IntentListFilter, limit int, afterID int64) ([]*send.SendIntent, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+intentCols+`, t.public_id AS task_public_id, t.message_kind, t.message_body,
			a.public_id AS account_public_id, a.nickname,
			f.public_id AS friend_public_id, f.display_name,
			j.public_id, j.selected_adapter, j.attempt, j.status, j.error_code
		FROM send_intents si
		JOIN douyin_accounts a ON a.id = si.account_id
		JOIN friends f ON f.id = si.friend_id
		LEFT JOIN spark_tasks t ON t.id = si.task_id
		LEFT JOIN send_jobs j ON j.id = si.last_job_id
		WHERE a.user_id = $1
		  AND ($2::uuid IS NULL OR a.public_id = $2)
		  AND ($3::uuid IS NULL OR f.public_id = $3)
		  AND ($4::text = '' OR si.status = $4)
		  AND ($5::timestamptz IS NULL OR si.scheduled_at >= $5)
		  AND ($6::timestamptz IS NULL OR si.scheduled_at < $6)
		  AND ($7::bigint = 0 OR si.id < $7)
		ORDER BY si.id DESC
		LIMIT $8
	`, userID, filter.AccountID, filter.FriendID, filter.Status, filter.From, filter.To, afterID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*send.SendIntent
	for rows.Next() {
		var in send.SendIntent
		var taskID pgtype.UUID
		var taskKind pgtype.Text
		var taskBody pgtype.Text
		var jobID pgtype.UUID
		var adapter pgtype.Text
		var attempt pgtype.Int4
		var jobStatus pgtype.Text
		var jobError pgtype.Text
		if err := rows.Scan(&in.ID, &in.PublicID, &in.IntentType, &in.RequestID, &in.TaskID, &in.AccountID,
			&in.FriendID, &in.LocalDate, &in.ScheduledAt, &in.Status, &in.ErrorCode, &in.NextAttemptAt,
			&in.LastJobID, &in.CreatedAt, &in.UpdatedAt, &taskID, &taskKind, &taskBody, &in.AccountPublicID, &in.AccountNickname,
			&in.FriendPublicID, &in.FriendDisplayName, &jobID, &adapter, &attempt, &jobStatus, &jobError); err != nil {
			return nil, err
		}
		if taskID.Valid {
			id := uuid.UUID(taskID.Bytes)
			in.TaskPublicID = &id
		}
		if taskKind.Valid {
			in.TaskMessageKind = &taskKind.String
		}
		if taskBody.Valid {
			in.TaskMessageBody = &taskBody.String
		}
		if jobID.Valid {
			in.LatestJob = &send.SendJob{
				PublicID: uuid.UUID(jobID.Bytes), SelectedAdapter: nullableText(adapter),
				Attempt: int(attempt.Int32), Status: send.JobStatus(jobStatus.String), ErrorCode: nullableText(jobError),
			}
		}
		out = append(out, &in)
	}
	return out, rows.Err()
}

func nullableText(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

// ---- jobs ----

const sendJobCols = `j.id, j.public_id, j.intent_id, j.account_id, j.friend_id, j.attempt,
	j.selected_adapter, j.status, j.error_code, j.retryable, j.platform_message_id, j.worker_id,
	j.heartbeat_at, j.lease_expires_at, j.started_at, j.finished_at, j.created_at`

const sendJobReturnCols = `id, public_id, intent_id, account_id, friend_id, attempt,
	selected_adapter, status, error_code, retryable, platform_message_id, worker_id,
	heartbeat_at, lease_expires_at, started_at, finished_at, created_at`

func sendJobScanArgs(j *send.SendJob) []any {
	return []any{&j.ID, &j.PublicID, &j.IntentID, &j.AccountID, &j.FriendID, &j.Attempt,
		&j.SelectedAdapter, &j.Status, &j.ErrorCode, &j.Retryable, &j.PlatformMessageID, &j.WorkerID,
		&j.HeartbeatAt, &j.LeaseExpiresAt, &j.StartedAt, &j.FinishedAt, &j.CreatedAt}
}

func scanSendJob(row rowScanner) (*send.SendJob, error) {
	var j send.SendJob
	err := row.Scan(sendJobScanArgs(&j)...)
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (r *SendRepo) CreateJob(ctx context.Context, j *send.SendJob) error {
	return From(ctx, r.pool).QueryRow(ctx, `
		INSERT INTO send_jobs (public_id, intent_id, account_id, friend_id, attempt, selected_adapter, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id
	`, j.PublicID, j.IntentID, j.AccountID, j.FriendID, j.Attempt, j.SelectedAdapter, j.Status, j.CreatedAt).Scan(&j.ID)
}

func (r *SendRepo) SetSelectedAdapter(ctx context.Context, jobID int64, adapter string) error {
	_, err := From(ctx, r.pool).Exec(ctx,
		`UPDATE send_jobs SET selected_adapter=$2 WHERE id=$1 AND status='queued'`, jobID, adapter)
	return err
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

// FindExpiredJobs locks a bounded set of expired running attempts for the
// caller's transaction. The lock is held until that transaction finishes,
// preventing two scheduler leaders from reaping the same attempt.
func (r *SendRepo) FindExpiredJobs(ctx context.Context, at time.Time, limit int) ([]send.ExpiredSendJob, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+sendJobCols+`, `+intentCols+`, a.user_id
		FROM send_jobs j
		JOIN send_intents si ON si.id = j.intent_id
		JOIN douyin_accounts a ON a.id = j.account_id
		WHERE j.status = 'running'
		  AND j.lease_expires_at IS NOT NULL
		  AND j.lease_expires_at < $1
		ORDER BY j.id
		LIMIT $2
		FOR UPDATE OF j SKIP LOCKED`, at, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []send.ExpiredSendJob
	for rows.Next() {
		var j send.SendJob
		var in send.SendIntent
		var userID int64
		args := append(sendJobScanArgs(&j), intentScanArgs(&in)...)
		args = append(args, &userID)
		if err := rows.Scan(args...); err != nil {
			return nil, err
		}
		out = append(out, send.ExpiredSendJob{Job: &j, Intent: &in, UserID: userID})
	}
	return out, rows.Err()
}

// FindRetryDue locks retry_wait intents for one scheduler transaction. The
// lock makes retry scans safe even if two scheduler leaders overlap briefly.
func (r *SendRepo) FindRetryDue(ctx context.Context, at time.Time, limit int) ([]send.RetryDueIntent, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := From(ctx, r.pool).Query(ctx, `
		SELECT `+intentCols+`, a.user_id
		FROM send_intents si
		JOIN douyin_accounts a ON a.id = si.account_id
		WHERE si.status = 'retry_wait'
		  AND si.next_attempt_at IS NOT NULL
		  AND si.next_attempt_at <= $1
		ORDER BY si.id
		LIMIT $2
		FOR UPDATE OF si SKIP LOCKED`, at, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []send.RetryDueIntent
	for rows.Next() {
		var in send.SendIntent
		var userID int64
		args := append(intentScanArgs(&in), &userID)
		if err := rows.Scan(args...); err != nil {
			return nil, err
		}
		out = append(out, send.RetryDueIntent{Intent: &in, UserID: userID})
	}
	return out, rows.Err()
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
var _ send.PageRepository = (*SendRepo)(nil)
