package asynqworker

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

const defaultProfileRoot = "/tmp/douyin-keeper/login"

func prepareProfileRoot(root string) (string, error) {
	if root == "" {
		root = defaultProfileRoot
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", err
	}
	if err := os.Chmod(root, 0o700); err != nil {
		return "", err
	}
	return root, nil
}

// accountProfileDir gives every platform account one persistent browser
// profile. The directory name is derived only from the public account UUID,
// never from a nickname or user-provided label.
func accountProfileDir(root string, accountPublicID uuid.UUID) (string, error) {
	root, err := prepareProfileRoot(root)
	if err != nil {
		return "", err
	}
	dir := filepath.Join(root, "account-"+strings.ToLower(accountPublicID.String()))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}

func sessionInput(path, profileDir string) map[string]any {
	session := map[string]any{
		"kind": "playwright_storage_state_file",
		"path": path,
	}
	if strings.TrimSpace(profileDir) != "" {
		session["profile_dir"] = profileDir
	}
	return map[string]any{"session": session}
}

func createSessionExportFile(root string) (string, func(), error) {
	root, err := prepareProfileRoot(root)
	if err != nil {
		return "", func() {}, err
	}
	file, err := os.CreateTemp(root, "session-export-*.json")
	if err != nil {
		return "", func() {}, err
	}
	path := file.Name()
	cleanup := func() {
		_ = file.Close()
		_ = os.Remove(path)
	}
	if err := file.Chmod(0o600); err != nil {
		cleanup()
		return "", func() {}, err
	}
	if err := file.Close(); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return path, cleanup, nil
}
