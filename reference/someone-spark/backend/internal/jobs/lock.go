package jobs

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	AccountLockPrefix     = "lock:account:"
	LoginJobKeyPrefix     = "login:job:"
	LoginActivePrefix     = "login:active:"
	LoginCancelPrefix     = "login:cancel:"
	LoginSidecarPrefix    = "login:sidecar:"
	LoginLastPrefix       = "login:last:"
	LoginEvtPrefix        = "login:evt:"
	LoginCodePrefix       = "login:code:"
	LoginJobTTL           = 12 * time.Minute
	LoginQRLockTTL        = 10 * time.Minute
	LoginSMSLockTTL       = 3 * time.Minute
	LoginLockStealAfter   = 90 * time.Second
	LoginLockHardSteal    = 10 * time.Minute
	LoginQRSidecarTimeout = 9 * time.Minute
	BusyLoginMessage      = "上一次扫码还在进行，请等待或取消"
	CancelledLoginMessage = "已取消当前登录作业"
)

type accountLock struct {
	JobID string `json:"job_id"`
	At    int64  `json:"at"`
}

func AccountLockKey(accountID int64) string {
	return AccountLockPrefix + strconv.FormatInt(accountID, 10)
}

func LoginJobKey(jobID string) string {
	return LoginJobKeyPrefix + jobID
}

func LoginActiveKey(accountID int64) string {
	return LoginActivePrefix + strconv.FormatInt(accountID, 10)
}

func LoginCancelKey(jobID string) string {
	return LoginCancelPrefix + jobID
}

func LoginSidecarKey(jobID string) string {
	return LoginSidecarPrefix + jobID
}

func LoginCodeKey(jobID string) string {
	return LoginCodePrefix + jobID
}

func BindSidecarPID(ctx context.Context, rdb *redis.Client, jobID string, pid int) {
	if rdb == nil || jobID == "" || pid <= 0 {
		return
	}
	_ = rdb.Set(ctx, LoginSidecarKey(jobID), strconv.Itoa(pid), LoginJobTTL).Err()
}

func TakeSidecarPID(ctx context.Context, rdb *redis.Client, jobID string) int {
	if rdb == nil || jobID == "" {
		return 0
	}
	s, err := rdb.Get(ctx, LoginSidecarKey(jobID)).Result()
	if err != nil || s == "" {
		return 0
	}
	n, _ := strconv.Atoi(s)
	return n
}

func MarkLoginCancel(ctx context.Context, rdb *redis.Client, jobID string) {
	if rdb == nil || jobID == "" {
		return
	}
	_ = rdb.Set(ctx, LoginCancelKey(jobID), "1", 2*time.Minute).Err()
}

func LoginCancelled(ctx context.Context, rdb *redis.Client, jobID string) bool {
	if rdb == nil || jobID == "" {
		return false
	}
	n, err := rdb.Exists(ctx, LoginCancelKey(jobID)).Result()
	return err == nil && n > 0
}

func CancelLogin(ctx context.Context, rdb *redis.Client, accountID int64, jobID string) (int, error) {
	if rdb == nil {
		return 0, nil
	}
	if jobID == "" {
		jobID, _ = rdb.Get(ctx, LoginActiveKey(accountID)).Result()
	}
	pid := 0
	if jobID != "" {
		MarkLoginCancel(ctx, rdb, jobID)
		pid = TakeSidecarPID(ctx, rdb, jobID)
		_ = rdb.Del(ctx, LoginJobKey(jobID), LoginSidecarKey(jobID), LoginCodeKey(jobID)).Err()
	}
	return pid, ClearAccountLock(ctx, rdb, accountID)
}

func encodeAccountLock(jobID string, at time.Time) string {
	if jobID == "" {
		jobID = "1"
	}
	b, err := json.Marshal(accountLock{JobID: jobID, At: at.Unix()})
	if err != nil {
		return jobID
	}
	return string(b)
}

func parseAccountLock(s string) accountLock {
	var v accountLock
	if json.Unmarshal([]byte(s), &v) == nil && (v.JobID != "" || v.At > 0) {
		if v.JobID == "" {
			v.JobID = "1"
		}
		return v
	}
	if s == "" {
		return accountLock{}
	}
	return accountLock{JobID: s}
}

func shouldStealLock(v accountLock, jobAlive bool, now time.Time, stealAfter, hardAfter time.Duration) bool {
	if v.JobID == "" && v.At == 0 {
		return true
	}
	if !jobAlive {
		return true
	}
	if v.At <= 0 {
		return false
	}
	age := now.Sub(time.Unix(v.At, 0))
	if age < 0 {
		age = 0
	}
	if hardAfter > 0 && age >= hardAfter {
		return true
	}
	if stealAfter > 0 && age >= stealAfter && stealAfter >= hardAfter {
		return true
	}
	return false
}

func loginJobAlive(ctx context.Context, rdb *redis.Client, jobID string) bool {
	if rdb == nil || jobID == "" || jobID == "1" {
		return false
	}
	n, err := rdb.Exists(ctx, LoginJobKey(jobID)).Result()
	return err == nil && n > 0
}

func AdmitLogin(ctx context.Context, rdb *redis.Client, accountID int64) bool {
	if rdb == nil {
		return true
	}
	cur, err := rdb.Get(ctx, AccountLockKey(accountID)).Result()
	if err == redis.Nil || cur == "" {
		return true
	}
	if err != nil {
		return true
	}
	v := parseAccountLock(cur)
	return shouldStealLock(v, loginJobAlive(ctx, rdb, v.JobID), time.Now(), LoginLockStealAfter, LoginLockHardSteal)
}

func ClearAccountLock(ctx context.Context, rdb *redis.Client, accountID int64) error {
	if rdb == nil {
		return nil
	}
	return rdb.Del(ctx, AccountLockKey(accountID), LoginActiveKey(accountID)).Err()
}

func (h *Handler) tryAccountLock(ctx context.Context, accountID int64, jobID string, ttl, stealAfter time.Duration) (bool, func()) {
	k := AccountLockKey(accountID)
	now := time.Now()
	val := encodeAccountLock(jobID, now)
	unlock := func() {
		cur, err := h.d.RDB.Get(context.Background(), k).Result()
		if err != nil || cur == "" {
			return
		}
		if cur == val {
			_ = h.d.RDB.Del(context.Background(), k).Err()
		}
	}
	ok, err := h.d.RDB.SetNX(ctx, k, val, ttl).Result()
	if err == nil && ok {
		return true, unlock
	}
	if err != nil {
		return false, func() {}
	}
	cur, err := h.d.RDB.Get(ctx, k).Result()
	if err != nil && err != redis.Nil {
		return false, func() {}
	}
	v := parseAccountLock(cur)
	alive := loginJobAlive(ctx, h.d.RDB, v.JobID)
	hard := ttl
	if hard <= 0 {
		hard = LoginLockHardSteal
	}
	if !shouldStealLock(v, alive, now, stealAfter, hard) {
		return false, func() {}
	}
	if err := h.d.RDB.Set(ctx, k, val, ttl).Err(); err != nil {
		return false, func() {}
	}
	return true, unlock
}

func (h *Handler) lock(ctx context.Context, accountID int64) (bool, func()) {
	return h.tryAccountLock(ctx, accountID, "send", 2*time.Minute, 2*time.Minute)
}

func (h *Handler) lockFor(ctx context.Context, accountID int64, ttl time.Duration) (bool, func()) {
	return h.tryAccountLock(ctx, accountID, "1", ttl, LoginLockStealAfter)
}

func (h *Handler) lockLogin(ctx context.Context, accountID int64, jobID string, ttl time.Duration) (bool, func()) {
	return h.tryAccountLock(ctx, accountID, jobID, ttl, LoginLockStealAfter)
}

func (h *Handler) clearLoginActive(accountID int64, jobID string) {
	if h == nil || h.d.RDB == nil || jobID == "" {
		return
	}
	ctx := context.Background()
	k := LoginActiveKey(accountID)
	cur, err := h.d.RDB.Get(ctx, k).Result()
	if err != nil || cur != jobID {
		return
	}
	_ = h.d.RDB.Del(ctx, k).Err()
}
