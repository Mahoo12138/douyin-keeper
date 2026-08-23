package billing

import (
	"testing"
	"time"
)

func TestDecidePaidNew(t *testing.T) {
	now := time.Date(2026, 8, 23, 4, 0, 0, 0, time.UTC)
	d := DecidePaid(now, nil, 31)
	if d.CancelOld || d.UpdateOld {
		t.Fatalf("%+v", d)
	}
	if !d.Start.Equal(now) || !d.End.Equal(now.AddDate(0, 0, 31)) {
		t.Fatalf("range %+v", d)
	}
}

func TestDecidePaidCoversTrial(t *testing.T) {
	now := time.Date(2026, 8, 23, 4, 0, 0, 0, time.UTC)
	cur := &CurrentSub{ID: 1, Source: "trial", Status: "active", StartsAt: now.AddDate(0, 0, -2), EndsAt: now.AddDate(0, 0, 5)}
	d := DecidePaid(now, cur, 7)
	if !d.CancelOld || d.UpdateOld {
		t.Fatalf("应覆盖体验 %+v", d)
	}
	if !d.Start.Equal(now) || !d.End.Equal(now.AddDate(0, 0, 7)) {
		t.Fatalf("不应折体验剩余天 %+v", d)
	}
}

func TestDecidePaidExtendFormal(t *testing.T) {
	now := time.Date(2026, 8, 23, 4, 0, 0, 0, time.UTC)
	end := now.AddDate(0, 0, 10)
	cur := &CurrentSub{ID: 2, Source: "purchase", Status: "active", StartsAt: now.AddDate(0, 0, -5), EndsAt: end}
	d := DecidePaid(now, cur, 31)
	if d.CancelOld || !d.UpdateOld {
		t.Fatalf("应顺延 %+v", d)
	}
	if !d.End.Equal(end.AddDate(0, 0, 31)) {
		t.Fatalf("end %+v", d.End)
	}
}

func TestDecidePaidExpiredFormal(t *testing.T) {
	now := time.Date(2026, 8, 23, 4, 0, 0, 0, time.UTC)
	cur := &CurrentSub{ID: 3, Source: "purchase", Status: "active", EndsAt: now.Add(-time.Hour)}
	d := DecidePaid(now, cur, 7)
	if !d.CancelOld || d.UpdateOld {
		t.Fatalf("过期应新开 %+v", d)
	}
}

func TestDailyCap(t *testing.T) {
	if DailyCap(15, 20, 0) != 15 {
		t.Fatal("站点默认")
	}
	if DailyCap(15, 20, 8) != 8 {
		t.Fatal("套餐限额优先")
	}
	if DailyCap(30, 20, 0) != 20 {
		t.Fatal("硬顶封顶")
	}
}

func TestCanAddSlot(t *testing.T) {
	if ok, _ := CanAddSlot(false, 1, 10, 9999, 3000); ok {
		t.Fatal("无套餐不能加号")
	}
	if ok, _ := CanAddSlot(true, 10, 10, 9999, 3000); ok {
		t.Fatal("满额不能加号")
	}
	if ok, _ := CanAddSlot(true, 1, 10, 100, 3000); ok {
		t.Fatal("余额不足")
	}
	if ok, reason := CanAddSlot(true, 1, 10, 3000, 3000); !ok {
		t.Fatal(reason)
	}
}
