package sidecar

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVerifyBundleAcceptsFixedManifestAndEntrypointHash(t *testing.T) {
	dir := t.TempDir()
	entrypoint := []byte("console.log('protocol sidecar')\n")
	if err := os.WriteFile(filepath.Join(dir, "index.mjs"), entrypoint, 0o600); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(entrypoint)
	writeBundleManifest(t, dir, BundleManifest{
		ProtocolVersion:  ProtocolVersion,
		Adapter:          "protocol.im",
		AdapterVersion:   "2026.08.25",
		Entrypoint:       "index.mjs",
		EntrypointSHA256: hex.EncodeToString(hash[:]),
	})

	manifest, err := VerifyBundle(dir, "protocol.im")
	if err != nil {
		t.Fatalf("VerifyBundle() error = %v", err)
	}
	if manifest.AdapterVersion != "2026.08.25" {
		t.Fatalf("manifest = %+v", manifest)
	}
}

func TestVerifyBundleRejectsUnsafeOrIncompatibleManifest(t *testing.T) {
	entrypoint := []byte("runtime")
	hash := sha256.Sum256(entrypoint)
	cases := []struct {
		name     string
		manifest BundleManifest
		want     string
	}{
		{
			name: "wrong protocol",
			manifest: BundleManifest{ProtocolVersion: 2, Adapter: "protocol.im", AdapterVersion: "1",
				Entrypoint: "index.mjs", EntrypointSHA256: hex.EncodeToString(hash[:])},
			want: "protocol version",
		},
		{
			name: "wrong adapter",
			manifest: BundleManifest{ProtocolVersion: ProtocolVersion, Adapter: "browser.consumer", AdapterVersion: "1",
				Entrypoint: "index.mjs", EntrypointSHA256: hex.EncodeToString(hash[:])},
			want: "does not match",
		},
		{
			name: "path traversal",
			manifest: BundleManifest{ProtocolVersion: ProtocolVersion, Adapter: "protocol.im", AdapterVersion: "1",
				Entrypoint: "../index.mjs", EntrypointSHA256: hex.EncodeToString(hash[:])},
			want: "stay inside",
		},
		{
			name: "invalid hash",
			manifest: BundleManifest{ProtocolVersion: ProtocolVersion, Adapter: "protocol.im", AdapterVersion: "1",
				Entrypoint: "index.mjs", EntrypointSHA256: "not-a-hash"},
			want: "64 hex",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.WriteFile(filepath.Join(dir, "index.mjs"), entrypoint, 0o600); err != nil {
				t.Fatal(err)
			}
			writeBundleManifest(t, dir, tc.manifest)
			if _, err := VerifyBundle(dir, "protocol.im"); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("VerifyBundle() error = %v, want %q", err, tc.want)
			}
		})
	}
}

func TestVerifyBundleRejectsUnknownFieldsHashMismatchAndSymlink(t *testing.T) {
	dir := t.TempDir()
	entrypoint := []byte("runtime")
	if err := os.WriteFile(filepath.Join(dir, "index.mjs"), entrypoint, 0o600); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(entrypoint)
	manifest := BundleManifest{ProtocolVersion: ProtocolVersion, Adapter: "protocol.im", AdapterVersion: "1",
		Entrypoint: "index.mjs", EntrypointSHA256: hex.EncodeToString(hash[:])}
	writeBundleManifest(t, dir, manifest)
	if err := os.WriteFile(filepath.Join(dir, "index.mjs"), []byte("changed"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyBundle(dir, "protocol.im"); err == nil || !strings.Contains(err.Error(), "sha256 mismatch") {
		t.Fatalf("hash mismatch error = %v", err)
	}

	writeRawManifest(t, dir, `{"protocol_version":1,"adapter":"protocol.im","adapter_version":"1","entrypoint":"index.mjs","entrypoint_sha256":"`+hex.EncodeToString(hash[:])+`","extra":true}`)
	if _, err := VerifyBundle(dir, "protocol.im"); err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("unknown field error = %v", err)
	}

	outside := filepath.Join(t.TempDir(), "outside.mjs")
	if err := os.WriteFile(outside, entrypoint, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(dir, "index.mjs")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "index.mjs")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	writeBundleManifest(t, dir, manifest)
	if _, err := VerifyBundle(dir, "protocol.im"); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("symlink error = %v", err)
	}
}

func TestUnavailableClientCanExposeIncompatibleBundle(t *testing.T) {
	client := NewUnavailableClientWithCode("protocol.im", ErrAdapterIncompatible, "bundle rejected")
	response, err := client.Call(t.Context(), Request{RequestID: "r1", Op: OpsMessageSendFirst})
	if err != nil || response == nil || response.Error == nil {
		t.Fatalf("response=%v err=%v", response, err)
	}
	if response.Error.Code != ErrAdapterIncompatible || response.Meta.Adapter != "protocol.im" {
		t.Fatalf("response = %+v", response)
	}
}

func writeBundleManifest(t *testing.T, dir string, manifest BundleManifest) {
	t.Helper()
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	writeRawManifest(t, dir, string(data))
}

func writeRawManifest(t *testing.T, dir, data string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, ProtocolBundleManifestFile), []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
}
