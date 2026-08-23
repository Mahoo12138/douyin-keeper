// Command migrate applies embedded SQL migrations; `migrate seed` writes the
// demo admin user, plan and one demo DK1 card. It runs as the `migrate`
// compose service (docs/16 §7).
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/config"
	"github.com/mahoo12138/douyin-keeper/backend/internal/entitlement"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/postgres"
)

// Demo seed credentials — override before real use.
const (
	adminUsername    = "admin"
	adminSeedPassword = "dk-admin-2026"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "seed" {
		if err := seed(); err != nil {
			fmt.Fprintln(os.Stderr, "seed:", err)
			os.Exit(1)
		}
		return
	}
	ctx := context.Background()
	cfg := config.Load()
	if err := cfg.Require("database"); err != nil {
		fatal(err)
	}
	pool, err := postgres.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		fatal(err)
	}
	defer pool.Close()
	if err := postgres.Migrate(ctx, pool, slog.Default()); err != nil {
		fatal(err)
	}
	fmt.Println("migrations applied")
}

// seed is idempotent: admin user, a demo "standard" plan and a 30-day batch
// with one printed DK1 card.
func seed() error {
	ctx := context.Background()
	cfg := config.Load()
	if err := cfg.Require("database", "card"); err != nil {
		return err
	}
	pool, err := postgres.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	tx := postgres.NewTxManager(pool)
	userLock := postgres.NewUserLockRepo(pool)
	entRepo := postgres.NewEntitlementRepo(pool)

	// 1) Admin user (idempotent).
	authSvc := auth.NewService(
		postgres.NewAuthUserRepo(pool), postgres.NewAuthSessionRepo(pool), tx,
		auth.NewHasher(), []byte("seed"), []byte(cfg.CardCodePepperDK1),
		15*time.Minute, 30*24*time.Hour, nil)
	admin, _, err := authSvc.CreateAdminUser(ctx, adminUsername, adminSeedPassword)
	if err != nil {
		return fmt.Errorf("admin seed: %w", err)
	}

	// 2) Demo plan (idempotent by code).
	ent := entitlement.NewService(entRepo, entRepo, entRepo, entRepo, userLock, tx, []byte(cfg.CardCodePepperDK1))
	plan := findPlanByCode(ctx, entRepo, "standard")
	if plan == nil {
		p, err := ent.CreatePlan(ctx, &entitlement.Plan{
			Code: "standard", Name: "标准版", Status: entitlement.StatusActive,
			AccountQuota: 3, TaskQuota: 10, DailySendQuota: 20,
			Features: map[string]bool{
				"browser_text_send": true, "sticker_send": false,
				"protocol_sender": false, "creator_first_message": false,
			},
		})
		if err != nil {
			return fmt.Errorf("plan seed: %w", err)
		}
		plan = p
	}

	// 3) One 30-day DK1 card, printed exactly once.
	codes, err := ent.CreateBatchWithCodes(ctx, &entitlement.CardBatch{
		EntitlementPlanID: plan.ID, Name: "demo-30d", DurationDays: 30, Quantity: 1,
		Status: entitlement.StatusActive, CodeVersion: entitlement.CardCodeVersion1,
		CreatedBy: admin.ID, Note: "seed demo",
	})
	if err != nil {
		return fmt.Errorf("card seed: %w", err)
	}

	fmt.Println("seed ok")
	fmt.Println("  admin username:", adminUsername)
	fmt.Println("  admin password:", adminSeedPassword, "(change before prod)")
	fmt.Println("  plan:", plan.Code, "(account_quota 3, task_quota 10, daily_send_quota 20)")
	for _, c := range codes {
		fmt.Println("  DEMO DK1 CARD:", c)
	}
	return nil
}

func findPlanByCode(ctx context.Context, repo *postgres.EntitlementRepo, code string) *entitlement.Plan {
	plans, err := repo.ListPlans(ctx)
	if err != nil {
		return nil
	}
	for _, p := range plans {
		if p.Code == code {
			return p
		}
	}
	return nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}