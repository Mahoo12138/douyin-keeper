package clock

import (
	"strconv"
	"strings"
	"time"
)

func ParseHM(s string) (hour, minute int, ok bool) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 {
		return 0, 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, 0, false
	}
	return h, m, true
}

func InQuiet(now time.Time, start, end string) bool {
	sh, sm, ok1 := ParseHM(start)
	eh, em, ok2 := ParseHM(end)
	if !ok1 || !ok2 {
		sh, sm, eh, em = 0, 0, 7, 0
	}
	t := now.In(Shanghai())
	cur := t.Hour()*60 + t.Minute()
	a := sh*60 + sm
	b := eh*60 + em
	if a == b {
		return false
	}
	if a < b {
		return cur >= a && cur < b
	}
	return cur >= a || cur < b
}

func ShanghaiDayRange(now time.Time) (from, to time.Time) {
	loc := Shanghai()
	t := now.In(loc)
	y, m, d := t.Date()
	from = time.Date(y, m, d, 0, 0, 0, 0, loc).UTC()
	to = from.Add(24 * time.Hour)
	return from, to
}
