package telemetry

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMetricsRenderIsStableAndCumulative(t *testing.T) {
	m := NewMetrics()
	m.AddCounter("send_total", 2, Label{Name: "status", Value: "success"}, Label{Name: "adapter", Value: `browser\"consumer`})
	m.AddGauge("browser_slots_in_use", 1)
	m.AddGauge("browser_slots_in_use", -1)
	m.Observe("job_duration_seconds", 0.02, Label{Name: "type", Value: "send"})

	rendered := m.Render()
	for _, want := range []string{
		"# TYPE send_total counter",
		`send_total{adapter="browser\\\"consumer",status="success"} 2`,
		"browser_slots_in_use 0",
		`job_duration_seconds_bucket{type="send",le="0.025"} 1`,
		`job_duration_seconds_bucket{type="send",le="+Inf"} 1`,
		"job_duration_seconds_count{type=\"send\"} 1",
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered metrics missing %q:\n%s", want, rendered)
		}
	}
}

func TestMetricsHandlerContentType(t *testing.T) {
	m := NewMetrics()
	m.AddCounter("job_total", 1)
	request := httptest.NewRequest("GET", "/metrics", nil)
	recorder := httptest.NewRecorder()
	m.Handler().ServeHTTP(recorder, request)
	if recorder.Code != 200 {
		t.Fatalf("metrics status = %d", recorder.Code)
	}
	if got := recorder.Header().Get("Content-Type"); got != "text/plain; version=0.0.4; charset=utf-8" {
		t.Fatalf("content type = %q", got)
	}
}
