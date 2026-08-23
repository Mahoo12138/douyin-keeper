package jobs

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestAccountLockKey(t *testing.T) {
	if AccountLockKey(42) != "lock:account:42" {
		t.Fatal(AccountLockKey(42))
	}
}

func TestParseAccountLockLegacy(t *testing.T) {
	v := parseAccountLock("1")
	if v.JobID != "1" || v.At != 0 {
		t.Fatalf("%+v", v)
	}
}

func TestParseAccountLockJSON(t *testing.T) {
	raw := encodeAccountLock("job-a", time.Unix(1700000000, 0))
	v := parseAccountLock(raw)
	if v.JobID != "job-a" || v.At != 1700000000 {
		t.Fatalf("%s %+v", raw, v)
	}
}

func TestShouldStealLock(t *testing.T) {
	now := time.Unix(1_700_000_900, 0)
	fresh := accountLock{JobID: "j1", At: 1_700_000_880}
	old := accountLock{JobID: "j1", At: 1_700_000_000}
	legacy := accountLock{JobID: "1"}
	if shouldStealLock(fresh, true, now, 90*time.Second, 5*time.Minute) {
		t.Fatal("活作业且未超时不应抢")
	}
	if !shouldStealLock(fresh, false, now, 90*time.Second, 5*time.Minute) {
		t.Fatal("持有者作业已不在应抢")
	}
	if !shouldStealLock(old, true, now, 90*time.Second, 5*time.Minute) {
		t.Fatal("锁超过 5 分钟应抢")
	}
	if !shouldStealLock(legacy, false, now, 90*time.Second, 5*time.Minute) {
		t.Fatal("旧锁无作业应抢")
	}
	almost := accountLock{JobID: "j1", At: now.Add(-80 * time.Second).Unix()}
	if shouldStealLock(almost, true, now, 90*time.Second, 5*time.Minute) {
		t.Fatal("80 秒内活作业不应抢")
	}
}

func TestLockSourceHasCompareDeleteAndBusyCopy(t *testing.T) {
	b, err := os.ReadFile("lock.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, `"lock:account:"`) {
		t.Fatal("锁键名")
	}
	if !strings.Contains(s, "cur == val") {
		t.Fatal("Unlock 必须按持有者比对再删")
	}
	if !strings.Contains(s, BusyLoginMessage) || !strings.Contains(BusyLoginMessage, "请等待或取消") {
		t.Fatal("busy 文案")
	}
	if !strings.Contains(s, "LoginCancelPrefix") || !strings.Contains(s, "LoginSidecarPrefix") || !strings.Contains(s, "func CancelLogin") {
		t.Fatal("取消须写 Redis cancel 并取出 sidecar PID")
	}
	if LoginQRSidecarTimeout < 180*time.Second || LoginQRSidecarTimeout > 10*time.Minute {
		t.Fatal("扫码 sidecar 超时须覆盖 180s 出码，并给身份验证留出填码时间")
	}
	if !strings.Contains(s, "LoginCodePrefix") {
		t.Fatal("扫码身份验证须有 Redis 验证码通道")
	}
}
