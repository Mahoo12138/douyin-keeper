package session

import (
	"context"
	"fmt"
	"os"
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

func NewService(repo Repository, tx TxManager, cipher Cipher, tempDir string) *Service {
	return &Service{repo: repo, tx: tx, cipher: cipher, tempDir: tempDir, now: time.Now}
}

func aad(userPublicID, accountPublicID uuid.UUID, keyVersion int) []byte {
	return []byte(fmt.Sprintf("session:v%d:user/%s:account/%s:key/%d", EnvelopeVersion,
		userPublicID, accountPublicID, keyVersion))
}

func (s *Service) Store(ctx context.Context, accountID int64, userPublicID, accountPublicID uuid.UUID, plaintext []byte) error {
	if s.cipher == nil || len(plaintext) == 0 {
		return apperr.New(apperr.CodeInternal, apperr.KindInternal, "session storage is not configured")
	}
	sealed, err := s.cipher.Seal(plaintext, aad(userPublicID, accountPublicID, KeyVersion))
	if err != nil {
		return apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "session encryption failed", err)
	}
	return s.tx.WithinTx(ctx, func(tctx context.Context) error {
		_, err := s.repo.ReplaceActive(tctx, ReplaceRequest{
			AccountID: accountID, KeyVersion: KeyVersion, CipherAlgorithm: CipherAlgorithm,
			Ciphertext: sealed, AADVersion: AADVersion, CreatedAt: s.now(),
		})
		return err
	})
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
		return nil, nil, apperr.Wrap(apperr.CodeInternal, apperr.KindInternal, "session decryption failed", err)
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
