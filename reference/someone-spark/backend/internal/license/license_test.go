package license

import "testing"

func TestCheckAlwaysValid(t *testing.T) {
	st := Check(nil)
	if !st.Valid {
		t.Fatalf("V1 stub 必须 valid，得到 %+v", st)
	}
	if st.Reason != "stub-always-valid" {
		t.Fatalf("reason = %q", st.Reason)
	}
}
