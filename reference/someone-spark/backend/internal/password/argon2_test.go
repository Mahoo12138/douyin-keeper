package password

import "testing"

func TestHashVerify(t *testing.T) {
	h, err := Hash("correct-horse")
	if err != nil {
		t.Fatal(err)
	}
	ok, err := Verify("correct-horse", h)
	if err != nil || !ok {
		t.Fatalf("verify ok=%v err=%v", ok, err)
	}
	ok, err = Verify("wrong-password", h)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("错误密码不应通过")
	}
}

func TestValidate(t *testing.T) {
	if err := Validate("short"); err == nil {
		t.Fatal("过短应失败")
	}
	if err := Validate("long-enough"); err != nil {
		t.Fatal(err)
	}
}
