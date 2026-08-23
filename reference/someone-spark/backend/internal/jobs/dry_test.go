package jobs

import (
	"os"
	"strings"
	"testing"
)

func TestDryRunSkipsUniques(t *testing.T) {
	b, err := os.ReadFile("send.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "if !p.DryRun") || !strings.Contains(s, "send_uniques") {
		t.Fatal("试跑不得写 send_uniques")
	}
	idx := strings.Index(s, "if !p.DryRun {")
	chunk := s[idx:]
	if !strings.Contains(chunk, "daily_send_counters") {
		t.Fatal("试跑不占日成功额度")
	}
}
