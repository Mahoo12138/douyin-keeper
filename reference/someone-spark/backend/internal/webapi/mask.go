package webapi

import "strings"

func MaskEmail(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	at := strings.LastIndex(s, "@")
	if at < 1 || at == len(s)-1 {
		return "***"
	}
	local := s[:at]
	if len(local) <= 2 {
		return local[:1] + "***" + s[at:]
	}
	return local[:2] + "***" + s[at:]
}
