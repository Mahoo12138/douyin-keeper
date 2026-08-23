package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters (OWASP-ish). Keep params configurable and allow a
// transparent re-hash when the stored parameters fall below the current
// policy (docs/13 §3.1).
type Hasher struct {
	Time        uint32
	Memory      uint32 // KiB
	Parallelism uint8
	KeyLen      uint32
	SaltLen     uint32
}

func NewHasher() *Hasher {
	return &Hasher{Time: 3, Memory: 64 * 1024, Parallelism: 4, KeyLen: 32, SaltLen: 16}
}

const encodedPrefix = "$argon2id$"

// Hash produces an encoded hash: $argon2id$v=19$m=...,t=...,p=...$salt$hash
func (h *Hasher) Hash(password string) (string, error) {
	salt := make([]byte, h.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, h.Time, h.Memory, h.Parallelism, h.KeyLen)
	params := fmt.Sprintf("v=19,m=%d,t=%d,p=%d", h.Memory, h.Time, h.Parallelism)
	return encodedPrefix + params + "$" + base64.RawStdEncoding.EncodeToString(salt) +
		"$" + base64.RawStdEncoding.EncodeToString(key), nil
}

func (h *Hasher) Verify(encoded, password string) (bool, error) {
	// "$argon2id$v=19,m=...,t=...,p=...$<salt>$<hash>" splits into 5 parts.
	parts := strings.Split(encoded, "$")
	if len(parts) != 5 || !strings.HasPrefix(encoded, encodedPrefix) {
		return false, fmt.Errorf("auth: malformed password hash")
	}
	var version int
	var memory uint32
	var timeCost uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[2], "v=%d,m=%d,t=%d,p=%d", &version, &memory, &timeCost, &parallelism); err != nil {
		return false, err
	}
	if version != argon2.Version {
		return false, fmt.Errorf("auth: unsupported argon2 version %d", version)
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil {
		return false, err
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, err
	}
	got := argon2.IDKey([]byte(password), salt, timeCost, memory, parallelism, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}