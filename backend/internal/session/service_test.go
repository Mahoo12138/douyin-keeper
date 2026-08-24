package session

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/cryptox"
)

type fakeRepo struct {
	stored    *Stored
	validated bool
}

func (r *fakeRepo) GetActive(context.Context, int64) (*Stored, error) { return r.stored, nil }
func (r *fakeRepo) ReplaceActive(_ context.Context, req ReplaceRequest) (*Stored, error) {
	r.stored = &Stored{ID: 1, AccountID: req.AccountID, Version: 1, KeyVersion: req.KeyVersion,
		CipherAlgorithm: req.CipherAlgorithm, Ciphertext: req.Ciphertext, AADVersion: req.AADVersion,
		CreatedAt: req.CreatedAt}
	return r.stored, nil
}
func (r *fakeRepo) MarkValidated(context.Context, int64, time.Time) error {
	r.validated = true
	return nil
}

type fakeTx struct{}

func (fakeTx) WithinTx(ctx context.Context, fn func(context.Context) error) error { return fn(ctx) }

func testCipher(t *testing.T) *cryptox.Cipher {
	t.Helper()
	c, err := cryptox.NewCipherFromHexKey("0000000000000000000000000000000000000000000000000000000000000000")
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestStoreAndWithTempFileCleansUp(t *testing.T) {
	repo := &fakeRepo{}
	tempDir := t.TempDir()
	svc := NewService(repo, fakeTx{}, testCipher(t), filepath.Join(tempDir, "sessions"))
	userID, accountID := uuid.New(), uuid.New()
	plaintext := []byte(`{"cookies":[{"name":"sessionid","value":"opaque"}]}`)
	if err := svc.Store(context.Background(), 7, userID, accountID, plaintext); err != nil {
		t.Fatal(err)
	}
	var path string
	if err := svc.WithTempFile(context.Background(), 7, userID, accountID, func(p string) error {
		path = p
		info, err := os.Stat(p)
		if err != nil {
			return err
		}
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("session file mode = %o, want 600", info.Mode().Perm())
		}
		body, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		if string(body) != string(plaintext) {
			t.Fatalf("unexpected plaintext: %s", body)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("session temp file still exists: %v", err)
	}
	if !repo.validated {
		t.Fatal("expected validation timestamp update")
	}
}

func TestWithTempFileRemovesFileOnCallbackError(t *testing.T) {
	repo := &fakeRepo{}
	userID, accountID := uuid.New(), uuid.New()
	cipher := testCipher(t)
	sealed, err := cipher.Seal([]byte(`{"cookies":[]}`), aad(userID, accountID, KeyVersion))
	if err != nil {
		t.Fatal(err)
	}
	repo.stored = &Stored{ID: 2, AccountID: 8, KeyVersion: KeyVersion, CipherAlgorithm: CipherAlgorithm,
		Ciphertext: sealed, AADVersion: AADVersion}
	svc := NewService(repo, fakeTx{}, cipher, t.TempDir())
	var path string
	wantErr := context.Canceled
	err = svc.WithTempFile(context.Background(), 8, userID, accountID, func(p string) error {
		path = p
		return wantErr
	})
	if err != wantErr {
		t.Fatalf("got %v, want %v", err, wantErr)
	}
	if _, statErr := os.Stat(path); !os.IsNotExist(statErr) {
		t.Fatalf("session temp file still exists after callback error: %v", statErr)
	}
	if repo.validated {
		t.Fatal("must not mark failed validation as validated")
	}
}
