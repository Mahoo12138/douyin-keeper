package jobs

import (
	"bytes"
	"testing"

	"huohua/internal/cryptox"
	"huohua/internal/douyin"
)

func TestTwoAccountBlobsIsolated(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	a := []byte(`{"cookies":[{"name":"sessionid","value":"AAA-slot-1"}],"origins":[]}`)
	b := []byte(`{"cookies":[{"name":"sessionid","value":"BBB-slot-2"}],"origins":[]}`)
	ca, err := cryptox.Seal(key, a)
	if err != nil {
		t.Fatal(err)
	}
	cb, err := cryptox.Seal(key, b)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(ca, cb) {
		t.Fatal("两号密文不应相同")
	}
	pa, err := cryptox.Open(key, ca)
	if err != nil {
		t.Fatal(err)
	}
	pb, err := cryptox.Open(key, cb)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(pa, []byte("BBB-slot-2")) || bytes.Contains(pb, []byte("AAA-slot-1")) {
		t.Fatal("解密串号")
	}
	if !bytes.Equal(pa, a) || !bytes.Equal(pb, b) {
		t.Fatal("明文往返失败")
	}
}

func TestPublishStripsSecrets(t *testing.T) {
	m := map[string]any{
		"type":          "qr",
		"image":         "data:image/svg+xml,x",
		"session_blob":  "nope",
		"storage_state": map[string]any{"cookies": []string{"x"}},
	}
	douyin.StripSecrets(m)
	if douyin.HasSecretKey(m) {
		t.Fatal(m)
	}
	if m["image"] == "" {
		t.Fatal("误删二维码")
	}
}
