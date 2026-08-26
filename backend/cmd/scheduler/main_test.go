package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRenewLeaderLoopStopsOnLeaseLoss(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	wantErr := errors.New("leader lock lost")
	lost := make(chan error, 1)
	done := make(chan struct{})

	go func() {
		renewLeaderLoop(ctx, time.Millisecond, func() error { return wantErr }, func(err error) {
			lost <- err
			cancel()
		})
		close(done)
	}()

	select {
	case err := <-lost:
		if !errors.Is(err, wantErr) {
			t.Fatalf("lease loss error = %v, want %v", err, wantErr)
		}
	case <-time.After(time.Second):
		t.Fatal("leader renewal loop did not report lease loss")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("leader renewal loop did not stop after lease loss")
	}
}

func TestRenewLeaderLoopDoesNotReportShutdownAsLeaseLoss(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	lost := make(chan error, 1)
	done := make(chan struct{})

	go func() {
		renewLeaderLoop(ctx, time.Millisecond, func() error {
			cancel()
			return context.Canceled
		}, func(err error) {
			lost <- err
		})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("leader renewal loop did not stop after shutdown")
	}
	select {
	case err := <-lost:
		t.Fatalf("shutdown was reported as lease loss: %v", err)
	default:
	}
}
