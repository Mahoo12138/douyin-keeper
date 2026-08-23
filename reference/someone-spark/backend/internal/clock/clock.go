package clock

import "time"

func Shanghai() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("CST", 8*3600)
	}
	return loc
}

// RemainingDays 按上海自然日计算套餐剩余整天数，过期为 0。
func RemainingDays(now, endsAt time.Time) int {
	if !endsAt.After(now) {
		return 0
	}
	loc := Shanghai()
	today := truncateDay(now.In(loc))
	end := truncateDay(endsAt.In(loc))
	d := int(end.Sub(today).Hours() / 24)
	if d < 0 {
		return 0
	}
	return d
}

func LocalDate(now time.Time) string {
	return now.In(Shanghai()).Format("2006-01-02")
}

func truncateDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}
