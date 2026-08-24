package account

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

func TestBindingJobPayloadCarriesSMSPhoneOnlyToWorkerHandoff(t *testing.T) {
	jobID := uuid.New()
	var payload map[string]string
	if err := json.Unmarshal(bindingJobPayload(jobID, "+86 13800138000"), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["job_id"] != jobID.String() || payload["phone"] != "+86 13800138000" {
		t.Fatalf("unexpected binding payload: %+v", payload)
	}
	if _, ok := payload["code"]; ok {
		t.Fatal("SMS verification code must not be included in the binding payload")
	}
}
