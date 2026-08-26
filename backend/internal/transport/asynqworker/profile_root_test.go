package asynqworker

import (
	"os"
	"path/filepath"
	"testing"
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
