package archive

import (
	"testing"
	"time"
)

func TestBodyHashStable(t *testing.T) {
	if BodyHash("火花") == BodyHash("别的") {
		t.Fatal("hash 不应相同")
	}
	if BodyHash("火花") != BodyHash("火花") {
		t.Fatal("同文案应稳定")
	}
}

func TestTimeBucketMinute(t *testing.T) {
	a := time.Date(2026, 8, 23, 1, 12, 3, 0, time.UTC)
	b := time.Date(2026, 8, 23, 1, 12, 59, 0, time.UTC)
	if !TimeBucket(a).Equal(TimeBucket(b)) {
		t.Fatal("同一分钟应同桶")
	}
	c := time.Date(2026, 8, 23, 1, 13, 0, 0, time.UTC)
	if TimeBucket(a).Equal(TimeBucket(c)) {
		t.Fatal("跨分钟应不同桶")
	}
}
