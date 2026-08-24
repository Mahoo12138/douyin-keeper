package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminAccountPauseResumeWritesAudit(t *testing.T) {
	ctx := context.Background()
	ownerID := newUser(t)
	actorID := newUser(t)
	now := time.Now()
	acct := &account.Account{
		PublicID: uuid.New(), UserID: ownerID, Nickname: "管理员操作账号",
		BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
		RiskStatus: account.RiskNormal, CreatedAt: now, UpdatedAt: now,
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	repo := postgres.NewAdminRepo(pool, nil)

	paused, err := repo.SetAccountPaused(ctx, actorID, acct.PublicID, true)
	if err != nil || paused.PausedAt == nil {
		t.Fatalf("pause result = %+v, err = %v", paused, err)
	}
	resumed, err := repo.SetAccountPaused(ctx, actorID, acct.PublicID, false)
	if err != nil || resumed.PausedAt != nil {
		t.Fatalf("resume result = %+v, err = %v", resumed, err)
	}

	var actions []string
	rows, err := pool.Query(ctx, `
		SELECT action FROM audit_logs
		WHERE actor_user_id=$1 AND resource_type='douyin_account' AND resource_id=$2
		ORDER BY id`, actorID, acct.PublicID.String())
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var action string
		if err := rows.Scan(&action); err != nil {
			t.Fatal(err)
		}
		actions = append(actions, action)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(actions) != 2 || actions[0] != "account.pause" || actions[1] != "account.resume" {
		t.Fatalf("audit actions = %v", actions)
	}
}

func TestAdminAccountCannotResumeActiveCooldown(t *testing.T) {
	ctx := context.Background()
	ownerID := newUser(t)
	actorID := newUser(t)
	now := time.Now()
	acct := &account.Account{
		PublicID: uuid.New(), UserID: ownerID, Nickname: "冷却账号",
		BindingStatus: account.BindingBound, SessionStatus: account.SessionValid,
		RiskStatus: account.RiskCoolingDown, CooldownUntil: ptrTime(now.Add(time.Hour)), CreatedAt: now, UpdatedAt: now,
	}
	if err := postgres.NewAccountRepo(pool).Create(ctx, acct); err != nil {
		t.Fatal(err)
	}
	if _, err := postgres.NewAdminRepo(pool, nil).SetAccountPaused(ctx, actorID, acct.PublicID, false); err == nil {
		t.Fatal("resume during cooldown should fail")
	} else if appErr, ok := apperr.As(err); !ok || appErr.Code != apperr.CodeAccountCooldownActive {
		t.Fatalf("cooldown error = %v", err)
	}
}
