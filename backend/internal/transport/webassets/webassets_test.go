package webassets

import (
	"io/fs"
	"testing"
)

func TestWebIncludesFreshCheckoutIndexFallback(t *testing.T) {
	web, err := Web()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fs.Stat(web, "index.html"); err != nil {
		t.Fatalf("embedded SPA index is missing: %v", err)
	}
}

func TestEmbeddedFallbackIsTrackedOutsideGeneratedDirectory(t *testing.T) {
	if _, err := fs.Stat(content, "fallback/index.html"); err != nil {
		t.Fatalf("fallback index is missing from the embedded contract: %v", err)
	}
}
