package billing

import "testing"

func TestNormalizeAndHash(t *testing.T) {
	a := HashCode("hh-ab12-cd34-ef56-7890")
	b := HashCode("HHAB12CD34EF567890")
	if a != b {
		t.Fatal("分隔符不应影响哈希")
	}
	if CodeEqual("wrong", a) {
		t.Fatal("错误卡密不应命中")
	}
	if !CodeEqual("HH-AB12-CD34-EF56-7890", a) {
		t.Fatal("应命中")
	}
}

func TestRandomCardCode(t *testing.T) {
	c, err := RandomCardCode()
	if err != nil {
		t.Fatal(err)
	}
	if NormalizeCode(c) != c {
		t.Fatalf("生成码应已是紧凑大写 %s", c)
	}
	if len(c) != 18 {
		t.Fatalf("len=%d", len(c))
	}
}
