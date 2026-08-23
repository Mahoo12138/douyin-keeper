package jobs

import (
	"os"
	"strings"
	"testing"
)

func TestPauseSQLOnlyOneAccount(t *testing.T) {
	b, err := os.ReadFile("risk.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	idx := strings.Index(s, "func (h *Handler) pauseAccount")
	if idx < 0 {
		t.Fatal("找不到 pause")
	}
	chunk := s[idx:]
	if end := strings.Index(chunk[10:], "\nfunc "); end > 0 {
		chunk = chunk[:end+10]
	}
	if !strings.Contains(chunk, "WHERE id = ?") {
		t.Fatal("熔断必须按号 WHERE id")
	}
	if strings.Contains(strings.ToLower(chunk), "where user_id") {
		t.Fatal("不得按用户暂停全部号")
	}
}

func TestUniquesKeyIsDaily(t *testing.T) {
	b, err := os.ReadFile("../../migrations/000004_m4_chat.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, "PRIMARY KEY (account_id, friend_id, local_date)") {
		t.Fatal("send_uniques 必须挡住同日双发")
	}
}
