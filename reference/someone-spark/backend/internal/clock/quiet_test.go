package clock

import (
	"testing"
	"time"
)

func TestInQuietDefault(t *testing.T) {
	loc := Shanghai()
	if !InQuiet(time.Date(2026, 8, 23, 1, 0, 0, 0, loc), "00:00", "07:00") {
		t.Fatal("凌晨应静默")
	}
	if InQuiet(time.Date(2026, 8, 23, 7, 0, 0, 0, loc), "00:00", "07:00") {
		t.Fatal("07:00 起不应静默")
	}
	if InQuiet(time.Date(2026, 8, 23, 12, 0, 0, 0, loc), "00:00", "07:00") {
		t.Fatal("中午不应静默")
	}
}

func TestInQuietWrap(t *testing.T) {
	loc := Shanghai()
	if !InQuiet(time.Date(2026, 8, 23, 23, 30, 0, 0, loc), "22:00", "06:00") {
		t.Fatal("跨日应静默")
	}
	if InQuiet(time.Date(2026, 8, 23, 8, 0, 0, 0, loc), "22:00", "06:00") {
		t.Fatal("白天不应静默")
	}
}

func TestShanghaiDayRange(t *testing.T) {
	loc := Shanghai()
	from, to := ShanghaiDayRange(time.Date(2026, 8, 23, 1, 0, 0, 0, loc))
	if LocalDate(from) != "2026-08-23" {
		t.Fatal(from)
	}
	if to.Sub(from) != 24*time.Hour {
		t.Fatal(to.Sub(from))
	}
}
