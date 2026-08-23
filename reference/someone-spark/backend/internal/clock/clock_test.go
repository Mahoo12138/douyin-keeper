package clock

import (
	"testing"
	"time"
)

func TestLocalDateShanghai(t *testing.T) {
	loc := Shanghai()
	now := time.Date(2026, 8, 23, 1, 0, 0, 0, loc)
	if d := LocalDate(now.UTC()); d != "2026-08-23" {
		t.Fatal(d)
	}
}

func TestRemainingDays(t *testing.T) {
	loc := Shanghai()
	now := time.Date(2026, 8, 22, 23, 0, 0, 0, loc)
	end := time.Date(2026, 8, 25, 8, 0, 0, 0, loc)
	if n := RemainingDays(now, end); n != 3 {
		t.Fatalf("got %d", n)
	}
	if n := RemainingDays(now, now.Add(-time.Hour)); n != 0 {
		t.Fatalf("expired got %d", n)
	}
}
