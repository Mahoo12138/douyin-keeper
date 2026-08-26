package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
	"github.com/mahoo12138/douyin-keeper/backend/internal/job"
)

func TestSMSVerificationCodePattern(t *testing.T) {
	for _, value := range []string{"1234", "12345678"} {
		if !smsVerificationCodePattern.MatchString(value) {
			t.Errorf("code %q should be accepted", value)
		}
	}
	for _, value := range []string{"123", "123456789", "12a456", ""} {
		if smsVerificationCodePattern.MatchString(value) {
			t.Errorf("code %q should be rejected", value)
		}
	}
}

func TestLastEventIDRejectsInvalidAndNegativeValues(t *testing.T) {
	valid := httptest.NewRequest("GET", "/jobs/1/events", nil)
	valid.Header.Set("Last-Event-ID", "12")
	if got := lastEventID(valid); got != 12 {
		t.Fatalf("lastEventID(valid) = %d, want 12", got)
	}
	for _, value := range []string{"", "not-a-number", "-1"} {
		req := httptest.NewRequest("GET", "/jobs/1/events", nil)
		req.Header.Set("Last-Event-ID", value)
		if got := lastEventID(req); got != 0 {
			t.Fatalf("lastEventID(%q) = %d, want 0", value, got)
		}
	}
}

func TestWriteSSEEventUsesDocumentedEventIdAndDataFields(t *testing.T) {
	var output strings.Builder
	writeSSEEvent(&output, "qr_ready", 3, []byte(`{"format":"data_url"}`))
	if got, want := output.String(), "event: qr_ready\nid: 3\ndata: {\"format\":\"data_url\"}\n\n"; got != want {
		t.Fatalf("SSE frame = %q, want %q", got, want)
	}
}

func TestHandleJobEventsReturnsErrorBeforeStartingStreamWhenReplayFails(t *testing.T) {
	publicID := uuid.New()
	repo := &jobHandlerRepo{
		item:      &job.Job{ID: 41, PublicID: publicID, UserID: int64Ptr(7)},
		eventsErr: errors.New("database unavailable"),
	}
	server := &Server{jobs: job.NewService(repo)}

	req := httptest.NewRequest("GET", "/api/v1/jobs/"+publicID.String()+"/events", nil)
	ctx := chi.NewRouteContext()
	ctx.URLParams.Add("jobId", publicID.String())
	ctxWithRoute := context.WithValue(req.Context(), chi.RouteCtxKey, ctx)
	req = req.WithContext(auth.WithPrincipal(ctxWithRoute, auth.Principal{UserID: 7}))
	res := httptest.NewRecorder()

	server.handleJobEvents(res, req)

	if res.Code != 500 {
		t.Fatalf("status = %d, want 500", res.Code)
	}
	if got := res.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("content type = %q, want JSON error response", got)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if body.Error.Code != "INTERNAL_ERROR" {
		t.Fatalf("error code = %q, want INTERNAL_ERROR", body.Error.Code)
	}
	if repo.eventsCalls != 1 {
		t.Fatalf("ListEvents calls = %d, want 1", repo.eventsCalls)
	}
}

func int64Ptr(value int64) *int64 { return &value }

type jobHandlerRepo struct {
	item        *job.Job
	eventsErr   error
	eventsCalls int
}

func (r *jobHandlerRepo) CreateJob(context.Context, *job.Job) error { return nil }
func (r *jobHandlerRepo) GetOwned(_ context.Context, _ *int64, publicID uuid.UUID) (*job.Job, error) {
	if r.item == nil || r.item.PublicID != publicID {
		return nil, errors.New("job not found")
	}
	return r.item, nil
}
func (r *jobHandlerRepo) Claim(context.Context, uuid.UUID, string, time.Duration) (*job.Job, error) {
	return nil, nil
}
func (r *jobHandlerRepo) Heartbeat(context.Context, int64, string, time.Duration) error { return nil }
func (r *jobHandlerRepo) MarkWaiting(context.Context, int64, time.Duration) error       { return nil }
func (r *jobHandlerRepo) Finish(context.Context, int64, job.Status, *string, time.Time) error {
	return nil
}
func (r *jobHandlerRepo) IsCancelRequested(context.Context, int64) (bool, error) { return false, nil }
func (r *jobHandlerRepo) ListEvents(context.Context, int64) ([]job.JobEvent, error) {
	r.eventsCalls++
	return nil, r.eventsErr
}
func (r *jobHandlerRepo) AppendEvent(context.Context, int64, job.JobEvent) error { return nil }
func (r *jobHandlerRepo) RequestCancel(context.Context, int64, time.Time) error  { return nil }
