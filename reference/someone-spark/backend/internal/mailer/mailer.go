package mailer

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strconv"
	"strings"

	"huohua/internal/config"
)

func RandomCode() (string, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	n := int(b[0])<<16 | int(b[1])<<8 | int(b[2])
	return fmt.Sprintf("%06d", n%1000000), nil
}

func HashCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

type SMTP struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
}

func (s SMTP) usable() bool {
	return strings.TrimSpace(s.Host) != ""
}

func (s SMTP) normalized() SMTP {
	s.Host = strings.TrimSpace(s.Host)
	s.User = strings.TrimSpace(s.User)
	s.From = strings.TrimSpace(s.From)
	if s.Port <= 0 {
		s.Port = 587
	}
	if s.From == "" {
		s.From = s.User
	}
	return s
}

func pickSMTP(site, env SMTP) SMTP {
	if site.usable() {
		return site.normalized()
	}
	if env.usable() {
		return env.normalized()
	}
	return SMTP{}
}

type Sender struct {
	cfg *config.Config
}

func New(cfg *config.Config) *Sender {
	return &Sender{cfg: cfg}
}

func (s *Sender) envSMTP() SMTP {
	return SMTP{
		Host:     s.cfg.SMTPHost,
		Port:     s.cfg.SMTPPort,
		User:     s.cfg.SMTPUser,
		Password: s.cfg.SMTPPassword,
		From:     s.cfg.SMTPFrom,
	}
}

func (s *Sender) SendCode(to, purpose, code string, site SMTP) error {
	subject := "火花验证码"
	body := fmt.Sprintf("你的验证码是 %s，10 分钟内有效。若非本人操作请忽略。", code)
	cfg := pickSMTP(site, s.envSMTP())
	if !cfg.usable() {
		if s.cfg.Production() {
			slog.Error("mail send skipped", "reason", "smtp_not_configured", "purpose", purpose)
			return fmt.Errorf("未配置 SMTP")
		}
		slog.Info("dev mail code", "to", to, "purpose", purpose, "code", code)
		return nil
	}
	msg := []byte("To: " + to + "\r\n" +
		"From: " + cfg.From + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
		body + "\r\n")
	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
	auth := smtp.PlainAuth("", cfg.User, cfg.Password, cfg.Host)
	if err := smtp.SendMail(addr, auth, cfg.From, []string{to}, msg); err != nil {
		slog.Error("mail send failed", "purpose", purpose, "host", cfg.Host, "err", err)
		return fmt.Errorf("邮件发送失败")
	}
	return nil
}
