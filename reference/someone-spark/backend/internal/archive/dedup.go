package archive

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"
)

func BodyHash(body string) string {
	sum := sha256.Sum256([]byte(body))
	return hex.EncodeToString(sum[:])
}

func TimeBucket(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), 0, 0, time.UTC)
}

func NormalizeType(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "text", "sticker", "image", "system":
		return s
	default:
		return "unknown"
	}
}

func NormalizeDir(s string) string {
	if s == "out" {
		return "out"
	}
	return "in"
}
