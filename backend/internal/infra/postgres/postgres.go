// Package postgres owns the connection pool and transaction boundary.
// Domain repositories receive a DBTX (see From) and therefore don't depend on
// pgx concrete types (docs/14 §6).
package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DBTX is implemented by both *pgxpool.Pool and pgx.Tx.
type DBTX interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type txKey struct{}

// TxManager opens transactions and exposes them to callbacks via context.
type TxManager struct {
	pool *pgxpool.Pool
}

func NewTxManager(pool *pgxpool.Pool) *TxManager {
	return &TxManager{pool: pool}
}

func (m *TxManager) Pool() *pgxpool.Pool { return m.pool }

// WithinTx runs fn inside a single database transaction. fn receives a
// context carrying the tx handle; repositories call From(ctx, pool) to obtain
// it. On error the transaction is rolled back.
//
// Rules (docs/14 §6): never call sidecars / HTTP / enqueue Redis inside the
// tx; side effects go through the transactional outbox after commit.
func (m *TxManager) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := m.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("postgres: begin tx: %w", err)
	}
	txCtx := context.WithValue(ctx, txKey{}, tx)
	if err := fn(txCtx); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("postgres: commit tx: %w", err)
	}
	return nil
}

// From returns the current tx handle when inside WithinTx, otherwise the pool.
func From(ctx context.Context, pool *pgxpool.Pool) DBTX {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok && tx != nil {
		return tx
	}
	return pool
}

// Connect builds a pooled connection.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("postgres: parse url: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 1
	cfg.MaxConnLifetime = 30 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("postgres: connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("postgres: ping: %w", err)
	}
	return pool, nil
}