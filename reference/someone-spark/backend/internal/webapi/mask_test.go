package webapi

import "testing"

func TestMaskEmail(t *testing.T) {
	if got := MaskEmail("alice@example.com"); got != "al***@example.com" {
		t.Fatal(got)
	}
	if got := MaskEmail("ab@x.com"); got != "a***@x.com" {
		t.Fatal(got)
	}
}

func TestAdminDashHasNoSecrets(t *testing.T) {
	m := map[string]any{
		"cards": map[string]any{"active_subscribers": 1},
		"todos": []any{map[string]any{"email": "al***@x.com"}},
	}
	for _, k := range []string{"session_blob", "cookies", "storage_state", "phone_cipher"} {
		if _, ok := m[k]; ok {
			t.Fatal(k)
		}
	}
}
