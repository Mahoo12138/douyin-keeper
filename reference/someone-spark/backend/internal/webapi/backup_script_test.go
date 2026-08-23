package webapi

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBackupScriptCoversArchive(t *testing.T) {
	p := filepath.Join("..", "..", "..", "deploy", "backup", "backup.sh")
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, need := range []string{"chat_messages", "session_blob", "BACKUP_KEY_FILE", "mysqldump"} {
		if !strings.Contains(s, need) {
			t.Fatal(need)
		}
	}
	if strings.Contains(s, "session.key") {
		t.Fatal("备份不得打包 session.key")
	}
}
