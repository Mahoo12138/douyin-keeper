package httpapi

import "testing"

func TestSMSPhonePattern(t *testing.T) {
	for _, value := range []string{"13800138000", "+86 13800138000", "+1 (415) 555-0100"} {
		if !smsPhonePattern.MatchString(value) {
			t.Errorf("phone %q should be accepted", value)
		}
	}
	for _, value := range []string{"", "123", "phone-number", "+"} {
		if smsPhonePattern.MatchString(value) {
			t.Errorf("phone %q should be rejected", value)
		}
	}
}
