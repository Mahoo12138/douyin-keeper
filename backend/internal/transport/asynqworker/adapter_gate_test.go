package asynqworker

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

type adapterGateHealthStub struct {
	allowed bool
	err     error
}

func (s adapterGateHealthStub) Allow(context.Context, string) (bool, error) {
	return s.allowed, s.err
}

func (adapterGateHealthStub) ObserveSuccess(context.Context, string, string, time.Time) error {
	return nil
}
func (adapterGateHealthStub) ObserveFailure(context.Context, string, string, string, time.Time) error {
	return nil
}

func TestRequireAdapterAccessFailClosedForDisabledOrOpenAdapter(t *testing.T) {
	if err := requireAdapterAccess(context.Background(), adapterGateHealthStub{allowed: false}, "browser.consumer"); err == nil || adapterGateCode(err) != apperr.CodeAdapterUnavailable {
		t.Fatalf("blocked adapter error = %v", err)
	}
	if err := requireAdapterAccess(context.Background(), adapterGateHealthStub{err: errors.New("health store down")}, "browser.consumer"); err == nil || adapterGateCode(err) != apperr.CodeAdapterUnavailable {
		t.Fatalf("health lookup error = %v", err)
	}
}

func TestRequireAdapterAccessAllowsHealthyAdapterAndUnconfiguredTests(t *testing.T) {
	if err := requireAdapterAccess(context.Background(), adapterGateHealthStub{allowed: true}, "browser.consumer"); err != nil {
		t.Fatal(err)
	}
	if err := requireAdapterAccess(context.Background(), nil, "browser.consumer"); err != nil {
		t.Fatal(err)
	}
}
