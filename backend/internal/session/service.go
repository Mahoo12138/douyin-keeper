package session

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

type Service struct {
	repo    Repository
	tx      TxManager
	cipher  Cipher
	tempDir string
	now     func() time.Time
}

// DefaultTempFileMaxAge is longer than any normal Sidecar request, while
// still bounding how long decrypted session material can survive a crash.
const DefaultTempFileMaxAge = time.Hour

func NewService(repo Repository, tx TxManager, cipher Cipher, tempDir string) *Service {
	return &Service{repo: repo, tx: tx, cipher: cipher, tempDir: tempDir, now: time.Now}
}

// CleanupStaleTempFiles removes only old session temp files owned by this
// service. A worker may share the directory with another worker, so fresh
// files are preserved; stale files are safe crash leftovers because normal
// WithTempFile calls never keep them open beyond the Sidecar operation.
func (s *Service) CleanupStaleTempFiles(maxAge time.Duration) (int, error) {
	if maxAge <= 0 {
		return 0, fmt.Errorf("session temp max age must be positive")
	}
	entries, err := os.ReadDir(s.tempDir)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read session temp directory: %w", err)
	}
	cutoff := s.now().Add(-maxAge)
	removed := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		matched, err := filepath.Match("session-*.json", entry.Name())
		if err != nil {
			return removed, fmt.Errorf("match session temp file: %w", err)
		}
		if !matched {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return removed, fmt.Errorf("inspect session temp file %q: %w", entry.Name(), err)
		}
		if !info.Mode().IsRegular() || info.ModTime().After(cutoff) {
			continue
		}
		if err := os.Remove(filepath.Join(s.tempDir, entry.Name())); err != nil {
			return removed, fmt.Errorf("remove stale session temp file %q: %w", entry.Name(), err)
		}
		removed++
	}
	return removed, nil
}

func aad(userPublicID, accountPublicID uuid.UUID, keyVersion int) []byte {
	return []byte(fmt.Sprintf("session:v%d:user/%s:account/%s:key/%d", EnvelopeVersion,
		userPublicID, accountPublicID, keyVersion))
}

func (s *Service) Store(ctx context.Context, accountID int64, userPublicID, accountPublicID uuid.UUID, plaintext []byte) error {
	return s.tx.WithinTx(ctx, func(tctx context.Context) error {
		return s.StoreInTx(tctx, accountID, userPublicID, accountPublicID, plaintext)
	})
}

// StoreInTx replaces the active encrypted session using the transaction
// carried by ctx. Callers that also finalize a Job and mutate account state can
// use this method to keep the session envelope in the same atomic boundary.
func (s *Service) StoreInTx(ctx context.Context, accountID int64, userPublicID, accountPublicID uuid.UUID, plaintext []byte) error {
	if s.cipher == nil || len(plaintext) == 0 {
		return apperr.New(apperr.CodeInternal, apperr.KindInternal, "session storage is not configured")
	}
	sealed, err := s.cipher.Seal(plaintext, aad(userPublicID, accountPublicID, KeyVersion))
	if err != nil {
		return apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "session encryption failed", err)
	}
	_, err = s.repo.ReplaceActive(ctx, ReplaceRequest{
		AccountID: accountID, KeyVersion: KeyVersion, CipherAlgorithm: CipherAlgorithm,
		Ciphertext: sealed, AADVersion: AADVersion, CreatedAt: s.now(),
	})
	return err
}

func (s *Service) open(ctx context.Context, accountID int64, userPublicID, accountPublicID uuid.UUID) ([]byte, *Stored, error) {
	if s.cipher == nil {
		return nil, nil, apperr.New(apperr.CodeInternal, apperr.KindInternal, "session storage is not configured")
	}
	stored, err := s.repo.GetActive(ctx, accountID)
	if err != nil {
		return nil, nil, err
	}
	if stored.KeyVersion != KeyVersion || stored.CipherAlgorithm != CipherAlgorithm || stored.AADVersion != AADVersion {
		return nil, nil, apperr.New(apperr.CodeInternal, apperr.KindInternal, "unsupported session envelope")
	}
	plaintext, err := s.cipher.Open(stored.Ciphertext, aad(userPublicID, accountPublicID, stored.KeyVersion))
	if err != nil {
		// A worker cannot safely execute browser actions when the persisted
		// envelope was encrypted with another key (a common local/test restart
		// mistake). Surface this as an unusable login state instead of a generic
		// INTERNAL_ERROR so callers can require a fresh login and fail closed.
		return nil, nil, apperr.Wrap(apperr.CodeSessionExpired, apperr.KindUnauthenticated, "session decryption failed", err)
	}
	return plaintext, stored, nil
}

// WithTempFile makes decrypted state available only for the duration of fn.
// The directory and file permissions follow docs/07; cleanup runs even when
// Sidecar execution returns an error.
func (s *Service) WithTempFile(ctx context.Context, accountID int64, userPublicID, accountPublicID uuid.UUID, fn func(path string) error) error {
	plaintext, stored, err := s.open(ctx, accountID, userPublicID, accountPublicID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.tempDir, 0o700); err != nil {
		return apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "session temp directory failed", err)
	}
	file, err := os.CreateTemp(s.tempDir, "session-*.json")
	if err != nil {
		return apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "session temp file failed", err)
	}
	path := file.Name()
	cleanup := func() {
		_ = file.Close()
		_ = os.Remove(path)
	}
	defer cleanup()
	if err := file.Chmod(0o600); err != nil {
		return apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "session temp permissions failed", err)
	}
	if _, err := file.Write(plaintext); err != nil {
		return apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "session temp write failed", err)
	}
	if err := file.Close(); err != nil {
		return apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "session temp close failed", err)
	}
	if err := fn(path); err != nil {
		return err
	}
	return s.repo.MarkValidated(ctx, stored.ID, s.now())
}
