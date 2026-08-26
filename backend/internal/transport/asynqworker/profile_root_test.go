package asynqworker

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
)

func TestPrepareProfileRootCreatesPrivateDirectory(t *testing.T) {
	root := filepath.Join(t.TempDir(), "nested", "profiles")

	got, err := prepareProfileRoot(root)
	if err != nil {
		t.Fatalf("prepareProfileRoot() error = %v", err)
	}
	if got != root {
		t.Fatalf("prepareProfileRoot() = %q, want %q", got, root)
	}
	info, err := os.Stat(root)
	if err != nil {
		t.Fatalf("stat profile root: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0o700 {
		t.Fatalf("profile root mode = %o, want 700", mode)
	}
}

func TestPrepareProfileRootReportsPermissionPreparationErrors(t *testing.T) {
	file := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(file, []byte("occupied"), 0o600); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	if _, err := prepareProfileRoot(filepath.Join(file, "profiles")); err == nil {
		t.Fatal("prepareProfileRoot() error = nil, want directory preparation error")
	}
}

func TestAccountProfileDirIsStableAndPrivate(t *testing.T) {
	root := filepath.Join(t.TempDir(), "profiles")
	accountID := uuid.MustParse("03e99f8f-b082-46b7-8f76-e8029d8e30b7")

	first, err := accountProfileDir(root, accountID)
	if err != nil {
		t.Fatalf("accountProfileDir() error = %v", err)
	}
	second, err := accountProfileDir(root, accountID)
	if err != nil {
		t.Fatalf("accountProfileDir() second error = %v", err)
	}
	if first != second {
		t.Fatalf("accountProfileDir() changed path: %q != %q", first, second)
	}
	want := filepath.Join(root, "account-03e99f8f-b082-46b7-8f76-e8029d8e30b7")
	if first != want {
		t.Fatalf("accountProfileDir() = %q, want %q", first, want)
	}
	info, err := os.Stat(first)
	if err != nil {
		t.Fatalf("stat account profile: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0o700 {
		t.Fatalf("account profile mode = %o, want 700", mode)
	}
}

func TestCreateSessionExportFileIsPrivateAndCleanupIsEffective(t *testing.T) {
	root := filepath.Join(t.TempDir(), "profiles")
	path, cleanup, err := createSessionExportFile(root)
	if err != nil {
		t.Fatalf("createSessionExportFile() error = %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat session export: %v", err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("session export mode = %o, want 600", mode)
	}
	cleanup()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("session export still exists after cleanup, stat error = %v", err)
	}
}
