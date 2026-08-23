package douyin

import "testing"

func TestStripSecrets(t *testing.T) {
	m := map[string]any{
		"nickname":     "nick-a",
		"session_blob": "SECRET",
		"cookies":      []string{"a"},
		"nested":       map[string]any{"storage_state": "{}"},
	}
	StripSecrets(m)
	if HasSecretKey(m) {
		t.Fatalf("%v", m)
	}
	if m["nickname"] != "nick-a" {
		t.Fatal("误删公开字段")
	}
}

func TestMaskPhone(t *testing.T) {
	if got := MaskPhone("13812345678"); got != "138****5678" {
		t.Fatal(got)
	}
	if !ValidCNMobile("138-1234-5678") {
		t.Fatal("应接受大陆手机号")
	}
	if ValidCNMobile("123") {
		t.Fatal("过短")
	}
}
