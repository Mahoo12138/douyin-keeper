package sidecar

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// ProtocolBundleManifestFile is the only manifest filename accepted for a
// Protocol Sidecar bundle. Keeping the shape fixed makes the worker's trust
// boundary explicit and avoids executing an arbitrary package entrypoint.
const ProtocolBundleManifestFile = "manifest.json"

// BundleManifest is the signed-by-deployment metadata for an optional
// Protocol Sidecar bundle (docs/10 §13). The hash covers the entrypoint file;
// the bundle directory is the process working directory.
type BundleManifest struct {
	ProtocolVersion  int    `json:"protocol_version"`
	Adapter          string `json:"adapter"`
	AdapterVersion   string `json:"adapter_version"`
	Entrypoint       string `json:"entrypoint"`
	EntrypointSHA256 string `json:"entrypoint_sha256"`
}

// VerifyBundle validates the fixed manifest and the entrypoint artifact before
// a worker is allowed to launch a Protocol Sidecar process. It rejects unknown
// manifest fields, path traversal, symlinked entrypoints, incompatible adapter
// identities and hash mismatches.
func VerifyBundle(bundleDir, expectedAdapter string) (BundleManifest, error) {
	var manifest BundleManifest
	bundleDir = strings.TrimSpace(bundleDir)
	if bundleDir == "" {
		return manifest, errors.New("sidecar bundle: directory is required")
	}
	if expectedAdapter = strings.TrimSpace(expectedAdapter); expectedAdapter == "" {
		return manifest, errors.New("sidecar bundle: expected adapter is required")
	}

	manifestPath := filepath.Join(bundleDir, ProtocolBundleManifestFile)
	manifestInfo, err := os.Lstat(manifestPath)
	if err != nil {
		return manifest, fmt.Errorf("sidecar bundle: stat manifest: %w", err)
	}
	if manifestInfo.Mode()&os.ModeSymlink != 0 || !manifestInfo.Mode().IsRegular() {
		return manifest, errors.New("sidecar bundle: manifest must be a regular, non-symlink file")
	}
	file, err := os.Open(manifestPath)
	if err != nil {
		return manifest, fmt.Errorf("sidecar bundle: open manifest: %w", err)
	}
	defer file.Close()
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return manifest, fmt.Errorf("sidecar bundle: decode manifest: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return manifest, errors.New("sidecar bundle: manifest contains multiple JSON values")
		}
		return manifest, fmt.Errorf("sidecar bundle: decode trailing manifest data: %w", err)
	}

	if manifest.ProtocolVersion != ProtocolVersion {
		return manifest, fmt.Errorf("sidecar bundle: unsupported protocol version %d", manifest.ProtocolVersion)
	}
	if manifest.Adapter != expectedAdapter {
		return manifest, fmt.Errorf("sidecar bundle: adapter %q does not match %q", manifest.Adapter, expectedAdapter)
	}
	if strings.TrimSpace(manifest.AdapterVersion) == "" {
		return manifest, errors.New("sidecar bundle: adapter_version is required")
	}
	if err := validateBundleEntrypoint(manifest.Entrypoint); err != nil {
		return manifest, err
	}
	if err := rejectSymlinkComponents(bundleDir, manifest.Entrypoint); err != nil {
		return manifest, err
	}
	wantHash, err := parseSHA256(manifest.EntrypointSHA256)
	if err != nil {
		return manifest, err
	}

	entrypoint := filepath.Join(bundleDir, manifest.Entrypoint)
	info, err := os.Lstat(entrypoint)
	if err != nil {
		return manifest, fmt.Errorf("sidecar bundle: stat entrypoint: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return manifest, errors.New("sidecar bundle: entrypoint must be a regular, non-symlink file")
	}
	actualHash, err := hashFile(entrypoint)
	if err != nil {
		return manifest, fmt.Errorf("sidecar bundle: hash entrypoint: %w", err)
	}
	if !equalBytes(actualHash[:], wantHash[:]) {
		return manifest, fmt.Errorf("sidecar bundle: entrypoint sha256 mismatch")
	}
	return manifest, nil
}

func validateBundleEntrypoint(entrypoint string) error {
	entrypoint = strings.TrimSpace(entrypoint)
	if entrypoint == "" || filepath.IsAbs(entrypoint) || strings.Contains(entrypoint, "\\") {
		return errors.New("sidecar bundle: entrypoint must be a relative path")
	}
	clean := filepath.Clean(entrypoint)
	if clean == "." || clean != entrypoint || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return errors.New("sidecar bundle: entrypoint must stay inside the bundle")
	}
	return nil
}

func rejectSymlinkComponents(bundleDir, entrypoint string) error {
	current := bundleDir
	for _, component := range strings.Split(entrypoint, string(filepath.Separator)) {
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if err != nil {
			return fmt.Errorf("sidecar bundle: stat entrypoint component: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return errors.New("sidecar bundle: entrypoint path cannot contain symlinks")
		}
	}
	return nil
}

func parseSHA256(value string) ([32]byte, error) {
	var hash [32]byte
	value = strings.TrimSpace(value)
	if len(value) != sha256.Size*2 {
		return hash, errors.New("sidecar bundle: entrypoint_sha256 must be 64 hex characters")
	}
	if value != strings.ToLower(value) {
		return hash, errors.New("sidecar bundle: entrypoint_sha256 must use lowercase hex")
	}
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != sha256.Size {
		return hash, errors.New("sidecar bundle: entrypoint_sha256 must be valid hex")
	}
	copy(hash[:], decoded)
	return hash, nil
}

func hashFile(path string) ([32]byte, error) {
	var hash [32]byte
	file, err := os.Open(path)
	if err != nil {
		return hash, err
	}
	defer file.Close()
	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return hash, err
	}
	copy(hash[:], hasher.Sum(nil))
	return hash, nil
}

func equalBytes(left, right []byte) bool {
	if len(left) != len(right) {
		return false
	}
	var mismatch byte
	for i := range left {
		mismatch |= left[i] ^ right[i]
	}
	return mismatch == 0
}
