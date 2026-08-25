package integration

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/transport/httpapi"
)

func TestHealthReadyRequiresAppliedSchema(t *testing.T) {
	server := httpapi.NewServer(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, pool, nil)
	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	response := httptest.NewRecorder()
	server.Router().ServeHTTP(response, req)
	if response.Code != http.StatusOK {
		t.Fatalf("health ready status = %d, body = %s", response.Code, response.Body.String())
	}
}
