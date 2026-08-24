package auth

import (
	"strings"
	"testing"
)

func TestGenerateLinkCodeReturnsCanonicalEightCharacterCode(t *testing.T) {
	code, err := GenerateLinkCode()
	if err != nil {
		t.Fatal(err)
	}
	if len(code) != 9 || code[4] != '-' || len(strings.ReplaceAll(code, "-", "")) != 8 {
		t.Fatalf("unexpected link code format: %q", code)
	}
	if NormalizeLinkCode(strings.ToLower(strings.ReplaceAll(code, "-", ""))) != code {
		t.Fatalf("normalize did not restore canonical form: %q", code)
	}
}
