// Package session owns encrypted per-account platform session material.
// Decryption is intentionally available only through the worker-facing
// Service; API handlers and repositories never receive plaintext.
package session

import (
	"context"
	"time"
)

const (
	EnvelopeVersion = 1
	KeyVersion      = 1
	CipherAlgorithm = "AES-256-GCM"
	AADVersion      = 1
)

type Stored struct {
	ID              int64
	AccountID       int64
	Version         int
	KeyVersion      int
	CipherAlgorithm string
	Ciphertext      []byte
	AADVersion      int
	CreatedAt       time.Time
	LastValidatedAt *time.Time
	RevokedAt       *time.Time
}

type ReplaceRequest struct {
	AccountID       int64
	KeyVersion      int
	CipherAlgorithm string
	Ciphertext      []byte
	AADVersion      int
	CreatedAt       time.Time
}

// Cipher is the minimal crypto boundary owned by the session domain. The
// concrete AES-GCM implementation lives in infra/cryptox.
type Cipher interface {
	Seal(plaintext, aad []byte) ([]byte, error)
	Open(ciphertext, aad []byte) ([]byte, error)
}

type Repository interface {
	GetActive(ctx context.Context, accountID int64) (*Stored, error)
	ReplaceActive(ctx context.Context, req ReplaceRequest) (*Stored, error)
	MarkValidated(ctx context.Context, sessionID int64, at time.Time) error
}
