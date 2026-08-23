package postgres

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mahoo12138/douyin-keeper/backend/internal/outbox"
)

// OutboxRepo implements outbox.Outbox plus the publisher-side claim API.
type OutboxRepo struct {
	pool *pgxpool.Pool
}

func NewOutboxRepo(pool *pgxpool.Pool) *OutboxRepo { return &OutboxRepo{pool: pool} }

// Add inserts a message inside the caller's tx; UNIQUE(dedupe_key) absorbs
// duplicates.
func (r *OutboxRepo) Add(ctx context.Context, msg outbox.Message) error {
	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}
	if msg.AvailableAt.IsZero() {
		msg.AvailableAt = time.Now()
	}
	if msg.Payload == nil {
		msg.Payload = []byte("{}")
	}
	_, err := From(ctx, r.pool).Exec(ctx, `
		INSERT INTO queue_outbox (public_id, kind, aggregate_type, aggregate_id, payload_json, available_at, dedupe_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (dedupe_key) DO NOTHING
	`, msg.ID, msg.Kind, msg.AggregateType, msg.AggregateID, msg.Payload, msg.AvailableAt, msg.DedupeKey)
	return err
}

// PendingMessage is a claimed outbox row handed to the publisher.
type PendingMessage struct {
	ID        int64
	PublicID  string
	Kind      string
	Payload   []byte
	Attempts  int
}

// ClaimPending atomically claims up to n due messages (SKIP LOCKED).
func (r *OutboxRepo) ClaimPending(ctx context.Context, n int, lockedBy string, lockTTL time.Duration) ([]PendingMessage, error) {
	rows, err := From(ctx, r.pool).Query(ctx, `
		UPDATE queue_outbox SET
			status = 'publishing',
			locked_by = $1,
			locked_until = now() + $2::interval,
			attempts = attempts
		WHERE id IN (
			SELECT id FROM queue_outbox
			WHERE status = 'pending'
			  AND available_at <= now()
			  AND (next_attempt_at IS NULL OR next_attempt_at <= now())
			ORDER BY id
			LIMIT $3
			FOR UPDATE SKIP LOCKED
		)
		RETURNING id, public_id, kind, payload_json, attempts
	`, lockedBy, lockTTL.String(), n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingMessage
	for rows.Next() {
		var m PendingMessage
		if err := rows.Scan(&m.ID, &m.PublicID, &m.Kind, &m.Payload, &m.Attempts); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// FetchByPublicID loads one pending message by public id (used by workers to
// read the payload after the transport notification arrives).
func (r *OutboxRepo) FetchByPublicID(ctx context.Context, publicID string) (*PendingMessage, error) {
	var m PendingMessage
	err := r.pool.QueryRow(ctx, `
		SELECT id, public_id, kind, payload_json, attempts
		FROM queue_outbox WHERE public_id = $1`, publicID).Scan(&m.ID, &m.PublicID, &m.Kind, &m.Payload, &m.Attempts)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// MarkPublished records a successful relay (docs/15 §2.2).
func (r *OutboxRepo) MarkPublished(ctx context.Context, id int64) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE queue_outbox SET status='published', published_at=now(), locked_by=NULL, locked_until=NULL
		WHERE id=$1`, id)
	return err
}

// MarkFailed records a relay failure with backoff. On expiry the row goes dead.
func (r *OutboxRepo) MarkFailed(ctx context.Context, id int64, attempts int, nextAttemptAt time.Time, errCode string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE queue_outbox SET
			status = CASE WHEN $2 > $3 THEN 'dead' ELSE 'pending' END,
			attempts = $2,
			next_attempt_at = $4,
			last_error_code = $5,
			locked_by = NULL,
			locked_until = NULL
		WHERE id = $1
	`, id, attempts, MaxOutboxAttempts, nextAttemptAt, errCode)
	return err
}

// MaxOutboxAttempts is the relay retry ceiling before dead (docs/15 §2.2).
const MaxOutboxAttempts = 5

// ReconcileExpiredLocks returns expired 'publishing' rows to 'pending'.
func (r *OutboxRepo) ReconcileExpiredLocks(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE queue_outbox SET status='pending', locked_by=NULL, locked_until=NULL
		WHERE status='publishing' AND (locked_until IS NULL OR locked_until <= now())`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}