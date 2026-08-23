package entitlement

import (
	"fmt"
	"strings"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/cryptox"
)

// DK1 card-code format (docs/12 §5.1):
//
//	DK1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
//
// Payload uses Crockford Base32 (no I/L/O/U) with >= 120 bits of entropy.

const (
	// CardCodeVersion1 is the current pepper/format version.
	CardCodeVersion1 = 1

	alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	payloadLen = 30   // 30 x 5 bits = 150 bits of encoded entropy
	saltLen   = 20    // 160 raw random bytes-of-source bits (>= 120 required)
	groupLen  = 5
	numGroups = payloadLen / groupLen // 6
)

// GenerateCode returns a random DK1 card code.
func GenerateCode() (string, error) {
	raw, err := cryptox.RandomBytes(saltLen)
	if err != nil {
		return "", err
	}
	payload := encodeBase32(raw, payloadLen)
	return "DK1-" + formatGroups(payload), nil
}

// NormalizeCode canonicalizes a raw code for hashing (docs/13 §11): uppercase,
// trim, strip separators, verify prefix/version.
func NormalizeCode(raw string) (string, error) {
	code := strings.ToUpper(strings.TrimSpace(raw))
	var b strings.Builder
	for _, r := range code {
		if r == '-' || r == ' ' {
			continue
		}
		b.WriteRune(r)
	}
	compact := b.String()
	if !strings.HasPrefix(compact, "DK1") {
		return "", fmt.Errorf("entitlement: unsupported card code version")
	}
	body := strings.TrimPrefix(compact, "DK1")
	if len(body) != payloadLen {
		return "", fmt.Errorf("entitlement: malformed card code length")
	}
	for _, r := range body {
		if !strings.ContainsRune(alphabet, r) {
			return "", fmt.Errorf("entitlement: invalid card code character")
		}
	}
	return "DK1" + body, nil
}

// HashCode computes HMAC-SHA-256(payload) with the version-specific pepper.
func HashCode(pepper []byte, normalized string) []byte {
	return cryptox.HMACSHA256(pepper, []byte(normalized))
}

// Fingerprint is the first 10 hex chars of the hash (docs/12 §5.2), for
// support/ops only — never used for redemption.
func Fingerprint(hash []byte) string {
	return cryptox.HexFingerprint(hash, 10)
}

// FormatCode returns the human-friendly grouped form. Panics-free; input must
// be a valid generated payload (30 chars).
func FormatCode(compact string) string {
	body := strings.TrimPrefix(compact, "DK1")
	return "DK1-" + formatGroups(body)
}

func formatGroups(payload string) string {
	var parts []string
	for i := 0; i < len(payload); i += groupLen {
		end := i + groupLen
		if end > len(payload) {
			end = len(payload)
		}
		parts = append(parts, payload[i:end])
	}
	return strings.Join(parts, "-")
}

// encodeBase32 encodes raw bytes as a base32 string of at most maxLen
// characters using the Crockford alphabet (little-endian bitstream).
func encodeBase32(raw []byte, maxLen int) string {
	var out strings.Builder
	bitBuffer := 0
	bitCount := 0
	for _, b := range raw {
		bitBuffer = (bitBuffer << 8) | int(b)
		bitCount += 8
		for bitCount >= 5 {
			payload := (bitBuffer >> (bitCount - 5)) & 0x1F
			out.WriteByte(alphabet[payload])
			bitCount -= 5
		}
		bitBuffer &= (1 << bitCount) - 1
	}
	// Log byte after drain; keep buffer bits then final partial groups.
	if bitCount > 0 {
		payload := (bitBuffer << (5 - bitCount)) & 0x1F
		out.WriteByte(alphabet[payload])
	}
	s := out.String()
	if len(s) > maxLen {
		s = s[:maxLen]
	}
	return s
}