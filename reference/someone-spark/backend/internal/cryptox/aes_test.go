package cryptox

import "testing"

func TestSealOpen(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	ct, err := Seal(key, []byte(`{"cookies":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	pt, err := Open(key, ct)
	if err != nil {
		t.Fatal(err)
	}
	if string(pt) != `{"cookies":[]}` {
		t.Fatalf("got %s", pt)
	}
}
