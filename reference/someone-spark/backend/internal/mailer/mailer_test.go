package mailer

import (
	"testing"

	"huohua/internal/config"
)

func TestPickSMTPSiteWins(t *testing.T) {
	got := pickSMTP(SMTP{Host: "smtp.site.example", Port: 465, User: "site", Password: "sp", From: "a@b.c"}, SMTP{Host: "smtp.env.example", Port: 587, User: "env"})
	if got.Host != "smtp.site.example" || got.Port != 465 || got.User != "site" || got.From != "a@b.c" {
		t.Fatalf("应优先后台 SMTP，得到 %+v", got)
	}
}

func TestPickSMTPEnvFallback(t *testing.T) {
	got := pickSMTP(SMTP{}, SMTP{Host: "smtp.env.example", Port: 25, User: "env", From: ""})
	if got.Host != "smtp.env.example" || got.Port != 25 || got.From != "env" {
		t.Fatalf("后台空时应回落 .env，得到 %+v", got)
	}
}

func TestPickSMTPEmpty(t *testing.T) {
	got := pickSMTP(SMTP{Port: 587, User: "only-user"}, SMTP{})
	if got.usable() {
		t.Fatal("仅有用户没有 host 不可用")
	}
}

func TestSendCodeStdoutOnlyWhenNoSMTP(t *testing.T) {
	s := New(&config.Config{Env: "development", DevMail: "stdout", SMTPHost: "smtp.env.example", SMTPPort: 587, SMTPUser: "u"})
	if pickSMTP(SMTP{}, s.envSMTP()).Host == "" {
		t.Fatal("已配 .env SMTP 时不应走 stdout")
	}
	s2 := New(&config.Config{Env: "production", DevMail: "stdout"})
	if pickSMTP(SMTP{}, s2.envSMTP()).usable() {
		t.Fatal("生产未配 SMTP 应判定不可用")
	}
	if !s2.cfg.Production() {
		t.Fatal("应识别 production")
	}
}
