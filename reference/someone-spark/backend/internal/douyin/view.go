package douyin

import (
	"strings"
	"unicode"
)

var secretKeys = []string{"session_blob", "cookies", "cookie", "storage_state", "phone_cipher"}

func StripSecrets(m map[string]any) {
	if m == nil {
		return
	}
	for _, k := range secretKeys {
		delete(m, k)
	}
	for _, v := range m {
		if child, ok := v.(map[string]any); ok {
			StripSecrets(child)
		}
	}
}

func HasSecretKey(m map[string]any) bool {
	if m == nil {
		return false
	}
	for _, k := range secretKeys {
		if _, ok := m[k]; ok {
			return true
		}
	}
	for _, v := range m {
		if child, ok := v.(map[string]any); ok && HasSecretKey(child) {
			return true
		}
	}
	return false
}

func MaskPhone(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	d := b.String()
	if len(d) < 7 {
		if d == "" {
			return ""
		}
		return "***"
	}
	return d[:3] + "****" + d[len(d)-4:]
}

func NormalizePhone(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func ValidCNMobile(raw string) bool {
	p := NormalizePhone(raw)
	return len(p) == 11 && p[0] == '1'
}
