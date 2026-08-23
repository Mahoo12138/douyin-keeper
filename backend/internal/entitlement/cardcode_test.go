package entitlement

import (
	"strings"
	"testing"
)

func TestGenerateAndNormalizeCode(t *testing.T) {
	code, err := GenerateCode()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if !strings.HasPrefix(code, "DK1-") {
		t.Fatalf("bad prefix: %s", code)
	}
	parts := strings.Split(code, "-")
	if len(parts) != 7 || len(parts[1]) != 5 { // DK1 + 6 groups of 5
		t.Fatalf("bad shape: %s (%v)", code, parts)
	}
	// Normalize round trip with separators stripped / lowercased.
	norm, err := NormalizeCode(strings.ToLower(code))
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if len(norm) != 3+payloadLen {
		t.Fatalf("bad normalized length: %d", len(norm))
	}
	// A well-formed all-alphabet code is accepted.
	valid := "DK1-01234-56789-ABCDE-FGHJK-MNPQR-STVWX"
	if _, err := NormalizeCode(valid); err != nil {
		t.Fatalf("expected valid: %v", err)
	}
	// Ambiguous chars (I/L/O/U), wrong prefix, and short bodies are rejected.
	for _, bad := range []string{
		"XX1-01234-56789-ABCDE-FGHJK-MNPQR-STVWX",
		"DK1-ABCDE", "DK1-01234-56789-ABCDE-FGHIJ-MNPQR-STVWX",
	} {
		if _, err := NormalizeCode(bad); err == nil {
			t.Fatalf("expected error for %q", bad)
		}
	}
}

func TestHashAndFingerprintStable(t *testing.T) {
	pepper := []byte("unit-test-pepper-32-bytes-0123456789")
	norm, _ := NormalizeCode("DK1-01234-56789-ABCDE-FGHJK-MNPQR-STVWX")
	h1 := HashCode(pepper, norm)
	h2 := HashCode(pepper, norm)
	if string(h1) != string(h2) {
		t.Fatalf("hash must be deterministic")
	}
	if id := Fingerprint(h1); len(id) != 10 {
		t.Fatalf("fingerprint length: %d", len(id))
	}
	if string(h1) == norm {
		t.Fatalf("hash must not equal plaintext")
	}
}