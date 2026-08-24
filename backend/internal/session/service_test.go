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

func TestCleanupStaleTempFilesRemovesOnlyOldSessionFiles(t *testing.T) {
	tempDir := t.TempDir()
	now := time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC)
	oldPath := filepath.Join(tempDir, "session-old.json")
	freshPath := filepath.Join(tempDir, "session-fresh.json")
	unrelatedPath := filepath.Join(tempDir, "keep.txt")
	for _, path := range []string{oldPath, freshPath, unrelatedPath} {
		if err := os.WriteFile(path, []byte("opaque"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Chtimes(oldPath, now.Add(-2*time.Hour), now.Add(-2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(freshPath, now.Add(-5*time.Minute), now.Add(-5*time.Minute)); err != nil {
		t.Fatal(err)
	}

	svc := NewService(&fakeRepo{}, fakeTx{}, testCipher(t), tempDir)
	svc.now = func() time.Time { return now }
	removed, err := svc.CleanupStaleTempFiles(time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("removed %d files, want 1", removed)
	}
	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatalf("stale session file still exists: %v", err)
	}
	for _, path := range []string{freshPath, unrelatedPath} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("file %q should be preserved: %v", path, err)
		}
	}
}

func TestCleanupStaleTempFilesTreatsMissingDirectoryAsClean(t *testing.T) {
	svc := NewService(&fakeRepo{}, fakeTx{}, testCipher(t), filepath.Join(t.TempDir(), "missing"))
	removed, err := svc.CleanupStaleTempFiles(time.Hour)
	if err != nil || removed != 0 {
		t.Fatalf("removed=%d err=%v, want clean no-op", removed, err)
	}
}
