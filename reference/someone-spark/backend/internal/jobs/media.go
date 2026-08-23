package jobs

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"huohua/internal/config"
)

func snapshotMedia(mediaDir, root, rawURL string) (string, error) {
	if rawURL == "" || !strings.HasPrefix(rawURL, "http") {
		return "", fmt.Errorf("skip")
	}
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get(rawURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("http %d", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil || len(b) == 0 {
		return "", fmt.Errorf("empty")
	}
	sum := sha256.Sum256(b)
	hexSum := hex.EncodeToString(sum[:])
	key := "media/" + hexSum[:2] + "/" + hexSum
	dir := config.ResolveUnder(root, mediaDir, "")
	path := filepath.Join(dir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, b, 0o644); err != nil {
		return "", err
	}
	return key, nil
}
