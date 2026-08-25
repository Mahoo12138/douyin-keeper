package postgres

import "testing"

func TestAdminRepoExecutableCatalogDefaultsToBrowser(t *testing.T) {
	repo := NewAdminRepo(nil, nil)
	if !repo.executableAdapters["browser.consumer"] || repo.executableAdapters["protocol.im"] {
		t.Fatalf("default executable catalog = %#v", repo.executableAdapters)
	}
	repo.SetAdapterExecutable("protocol.im", true)
	if !repo.executableAdapters["protocol.im"] {
		t.Fatalf("protocol adapter was not enabled: %#v", repo.executableAdapters)
	}
	if repo.browserSlotsLimit != 3 {
		t.Fatalf("default browser slots limit = %d", repo.browserSlotsLimit)
	}
	repo.SetBrowserSlotsLimit(7)
	if repo.browserSlotsLimit != 7 {
		t.Fatalf("configured browser slots limit = %d", repo.browserSlotsLimit)
	}
	if repo.browserConcurrency != 3 {
		t.Fatalf("default browser concurrency = %d", repo.browserConcurrency)
	}
	repo.SetBrowserConcurrency(5)
	if repo.browserConcurrency != 5 {
		t.Fatalf("configured browser concurrency = %d", repo.browserConcurrency)
	}
}
