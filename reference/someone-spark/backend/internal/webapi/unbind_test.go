package webapi

import (
	"os"
	"strings"
	"testing"
)

func TestUnbindSQLKeepsArchive(t *testing.T) {
	b, err := os.ReadFile("douyin.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	idx := strings.Index(s, "func (s *Server) unbindDouyin")
	if idx < 0 {
		t.Fatal("找不到解绑")
	}
	chunk := s[idx:]
	if end := strings.Index(chunk[10:], "\nfunc "); end > 0 {
		chunk = chunk[:end+10]
	}
	if strings.Contains(strings.ToLower(chunk), "delete from chat_messages") || strings.Contains(chunk, "TRUNCATE") {
		t.Fatal("解绑不得删归档")
	}
}
