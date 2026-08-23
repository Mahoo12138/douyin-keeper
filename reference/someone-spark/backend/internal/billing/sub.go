package billing

import "time"

type CurrentSub struct {
	ID       int64
	Source   string
	Status   string
	StartsAt time.Time
	EndsAt   time.Time
}

type Decision struct {
	CancelOld bool
	UpdateOld bool
	Start     time.Time
	End       time.Time
}

// DecidePaid 正式套餐：有效正式套餐从 ends_at 顺延；体验或无套餐从 now 起算并取消旧体验。
func DecidePaid(now time.Time, cur *CurrentSub, durationDays int) Decision {
	if durationDays < 1 {
		durationDays = 1
	}
	if cur != nil && cur.Status == "active" && cur.Source != "trial" && cur.EndsAt.After(now) {
		return Decision{UpdateOld: true, Start: cur.StartsAt, End: cur.EndsAt.AddDate(0, 0, durationDays)}
	}
	d := Decision{Start: now, End: now.AddDate(0, 0, durationDays)}
	if cur != nil && cur.Status == "active" {
		d.CancelOld = true
	}
	return d
}

// DailyCap = min(套餐日限额或站点默认, 站点硬顶)。
func DailyCap(siteDefault, hard, planLimit int) int {
	n := siteDefault
	if planLimit > 0 {
		n = planLimit
	}
	if hard > 0 && n > hard {
		n = hard
	}
	if n < 1 {
		if hard > 0 {
			return hard
		}
		return 20
	}
	return n
}

func CanAddSlot(planValid bool, quota, max, balance, price int64) (ok bool, reason string) {
	if !planValid {
		return false, "需要有效套餐才能加号"
	}
	if max > 0 && quota >= max {
		return false, "已达站点号位上限"
	}
	if balance < price {
		return false, "余额不足"
	}
	return true, ""
}
