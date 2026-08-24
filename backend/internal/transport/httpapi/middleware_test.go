package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLoggingWriterPreservesFlusher(t *testing.T) {
	writer := &loggingWriter{ResponseWriter: httptest.NewRecorder(), status: http.StatusOK}
	if _, ok := any(writer).(http.Flusher); !ok {
		t.Fatal("loggingWriter must preserve http.Flusher for SSE")
	}
	writer.Flush()
}
