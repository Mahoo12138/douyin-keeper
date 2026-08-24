package asynqworker

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
	"github.com/mahoo12138/douyin-keeper/backend/internal/sidecar"
)

func TestValidatePlatformArchiveResultRequiresConfirmedMatchingReceipt(t *testing.T) {
	if err := validatePlatformArchiveResult(platformArchiveResult{Confirmed: false, PlatformConversationID: "conversation-1", Archived: true}, "conversation-1", true); err == nil {
		t.Fatal("an unconfirmed platform receipt must fail")
	}
	if err := validatePlatformArchiveResult(platformArchiveResult{Confirmed: true, PlatformConversationID: "other", Archived: true}, "conversation-1", true); err == nil {
		t.Fatal("a receipt for another conversation must fail")
	}
	if err := validatePlatformArchiveResult(platformArchiveResult{Confirmed: true, PlatformConversationID: "conversation-1", Archived: true}, "conversation-1", true); err != nil {
		t.Fatal(err)
	}
}

func TestMapPlatformArchiveSidecarErrors(t *testing.T) {
	tests := map[string]string{
		sidecar.ErrPlatformArchiveUnavailable: apperr.CodeAdapterUnavailable,
		sidecar.ErrTargetIdentityMismatch:     apperr.CodeTargetIdentityMismatch,
		sidecar.ErrConversationNotFound:       apperr.CodeConversationNotFound,
		sidecar.ErrBrowserSelectorChanged:     apperr.CodeBrowserSelectorChanged,
		sidecar.ErrSessionExpired:             apperr.CodeSessionExpired,
	}
	for input, want := range tests {
		if got := mapPlatformArchiveSidecarError(input); got != want {
			t.Errorf("mapPlatformArchiveSidecarError(%q) = %q, want %q", input, got, want)
		}
	}
}

type platformArchiveJobRepoStub struct {
	finishedStatus job.Status
	events         []job.JobEvent
}

func (s *platformArchiveJobRepoStub) CreateJob(context.Context, *job.Job) error { return nil }
func (s *platformArchiveJobRepoStub) GetOwned(context.Context, *int64, uuid.UUID) (*job.Job, error) {
	return nil, nil
}
func (s *platformArchiveJobRepoStub) Claim(context.Context, uuid.UUID, string, time.Duration) (*job.Job, error) {
	return nil, nil
}
func (s *platformArchiveJobRepoStub) Heartbeat(context.Context, int64, string, time.Duration) error {
	return nil
}
func (s *platformArchiveJobRepoStub) MarkWaiting(context.Context, int64, time.Duration) error {
	return nil
}
func (s *platformArchiveJobRepoStub) Finish(_ context.Context, _ int64, status job.Status, _ *string, _ time.Time) error {
	s.finishedStatus = status
	return nil
}
func (s *platformArchiveJobRepoStub) IsCancelRequested(context.Context, int64) (bool, error) {
	return false, nil
}
func (s *platformArchiveJobRepoStub) ListEvents(context.Context, int64) ([]job.JobEvent, error) {
	return nil, nil
}
func (s *platformArchiveJobRepoStub) AppendEvent(_ context.Context, _ int64, event job.JobEvent) error {
	s.events = append(s.events, event)
	return nil
}
func (s *platformArchiveJobRepoStub) RequestCancel(context.Context, int64, time.Time) error {
	return nil
}

type platformArchiveTxManagerStub struct{}

func (platformArchiveTxManagerStub) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

func TestCommitPlatformArchiveSuccessOnlyPublishesSanitizedEvent(t *testing.T) {
	repo := &platformArchiveJobRepoStub{}
	claimed := &job.Job{ID: 9, PublicID: uuid.New()}
	deps := SessionCheckDeps{Jobs: repo, Tx: platformArchiveTxManagerStub{}}
	if err := commitPlatformArchiveSuccess(context.Background(), deps, claimed, true, func() time.Time { return time.Unix(1, 0) }); err != nil {
		t.Fatal(err)
	}
	if repo.finishedStatus != job.StatusSucceeded || len(repo.events) != 1 || repo.events[0].EventType != "success" {
		t.Fatalf("unexpected terminal state: status=%q events=%+v", repo.finishedStatus, repo.events)
	}
	var payload map[string]any
	if err := json.Unmarshal(repo.events[0].Payload, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["archived"] != true {
		t.Fatalf("unexpected success payload: %v", payload)
	}
	if _, ok := payload["platform_conversation_id"]; ok {
		t.Fatal("platform conversation id must not be exposed in the Job event")
	}
}
