package integration

import (
	"context"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/admin"
	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

func TestAdminUserStatusRevokesSessionsAndWritesAudit(t *testing.T) {
	ctx := context.Background()
	actorID := newUser(t)
	registered, err := newAuthSvc().Register(ctx, "status_"+randSuffix(), "password123")
	if err != nil {
		t.Fatalf("register target: %v", err)
	}
	target := registered.User
	repo := postgres.NewAdminRepo(pool, nil)

	updated, err := repo.SetUserStatus(ctx, actorID, target.PublicID, admin.UserStatusDisabled)
	if err != nil || updated.Status != admin.UserStatusDisabled {
		t.Fatalf("disable result = %+v, err = %v", updated, err)
	}

	var revokedSessions, revokedTokens int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NOT NULL`, target.ID).Scan(&revokedSessions); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM auth_refresh_tokens t
		JOIN auth_sessions s ON s.id=t.session_id
		WHERE s.user_id=$1 AND t.revoked_at IS NOT NULL`, target.ID).Scan(&revokedTokens); err != nil {
		t.Fatal(err)
	}
	if revokedSessions != 1 || revokedTokens != 1 {
		t.Fatalf("revoked sessions/tokens = %d/%d, want 1/1", revokedSessions, revokedTokens)
	}
	if _, err := newAuthSvc().GetUserByPublicID(ctx, target.PublicID); err == nil {
		t.Fatal("disabled user should not resolve through active-user auth")
	} else if appErr, ok := apperr.As(err); !ok || appErr.Code != apperr.CodeUserDisabled {
		t.Fatalf("disabled user error = %v", err)
	}

	updated, err = repo.SetUserStatus(ctx, actorID, target.PublicID, admin.UserStatusActive)
	if err != nil || updated.Status != admin.UserStatusActive {
		t.Fatalf("enable result = %+v, err = %v", updated, err)
	}
	var actions []string
	rows, err := pool.Query(ctx, `
		SELECT action FROM audit_logs
		WHERE actor_user_id=$1 AND resource_type='user' AND resource_id=$2
		ORDER BY id`, actorID, target.PublicID.String())
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
	if len(actions) != 2 || actions[0] != "user.disable" || actions[1] != "user.enable" {
		t.Fatalf("audit actions = %v", actions)
	}
	logs, err := repo.ListAuditSummaries(ctx, admin.AuditFilter{ResourceType: "user", ResourceID: target.PublicID.String(), Limit: 10})
	if err != nil || len(logs) != 2 {
		t.Fatalf("resource audit filter = %d logs, err = %v", len(logs), err)
	}
}
