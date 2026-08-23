package billing

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"strings"
)

func NormalizeCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(strings.TrimSpace(code)) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func HashCode(code string) string {
	sum := sha256.Sum256([]byte(NormalizeCode(code)))
	return hex.EncodeToString(sum[:])
}

func CodeEqual(plain, hash string) bool {
	got := HashCode(plain)
	if len(got) != len(hash) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(hash)) == 1
}

func RandomCardCode() (string, error) {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	h := strings.ToUpper(hex.EncodeToString(raw[:]))
	return fmt.Sprintf("HH%s%s%s%s", h[0:4], h[4:8], h[8:12], h[12:16]), nil
}

func FormatCode(compact string) string {
	c := NormalizeCode(compact)
	if len(c) != 18 { // HH + 16 hex
		return c
	}
	return c[0:2] + "-" + c[2:6] + "-" + c[6:10] + "-" + c[10:14] + "-" + c[14:18]
}
