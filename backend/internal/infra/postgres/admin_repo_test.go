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
}
