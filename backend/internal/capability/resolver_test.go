package capability

import (
	"context"
	"testing"
	"time"
)

type resolverSnapshotRepo struct{ items []Capability }

func (r resolverSnapshotRepo) ListByAccount(context.Context, int64) ([]Capability, error) {
	return r.items, nil
}
func (resolverSnapshotRepo) GetByAccountAndName(context.Context, int64, string) (*Capability, error) {
	return nil, nil
}
func (resolverSnapshotRepo) Upsert(context.Context, Capability) error { return nil }

type resolverHealth struct{ allowed map[string]bool }

func (h resolverHealth) Allow(_ context.Context, adapter string) (bool, error) {
	return h.allowed[adapter], nil
}
func (resolverHealth) ObserveSuccess(context.Context, string, string, time.Time) error { return nil }
func (resolverHealth) ObserveFailure(context.Context, string, string, string, time.Time) error {
	return nil
}

func TestResolverPrefersProtocolThenFallsBackToExecutableBrowser(t *testing.T) {
	protocol, browser := AdapterProtocolIM, AdapterBrowserConsumer
	repo := resolverSnapshotRepo{items: []Capability{
		{Name: NameMessageTextExisting, Status: StatusAvailable, Adapter: &protocol},
	}}
	resolver := NewResolver(repo, resolverHealth{allowed: map[string]bool{protocol: true, browser: true}}, protocol, browser)
	route, err := resolver.Resolve(context.Background(), 1, ResolveRequest{MessageKind: "text", HasConversation: true})
	if err != nil || route.Adapter != protocol || !route.Available {
		t.Fatalf("protocol route=%+v err=%v", route, err)
	}

	resolver = NewResolver(repo, resolverHealth{allowed: map[string]bool{protocol: false, browser: true}}, browser)
	route, err = resolver.Resolve(context.Background(), 1, ResolveRequest{MessageKind: "text", HasConversation: true})
	if err != nil || route.Adapter != browser || route.Available {
		t.Fatalf("safe browser fallback route=%+v err=%v", route, err)
	}
}

func TestResolverDoesNotRouteProtocolWhenWorkerIsNotRegistered(t *testing.T) {
	protocol := AdapterProtocolIM
	resolver := NewResolver(resolverSnapshotRepo{items: []Capability{{
		Name: NameMessageTextExisting, Status: StatusAvailable, Adapter: &protocol,
	}}}, resolverHealth{allowed: map[string]bool{protocol: true, AdapterBrowserConsumer: true}}, AdapterBrowserConsumer)
	route, err := resolver.Resolve(context.Background(), 1, ResolveRequest{MessageKind: "text", HasConversation: true})
	if err != nil || route.Adapter != AdapterBrowserConsumer || route.Available {
		t.Fatalf("unregistered protocol route=%+v err=%v", route, err)
	}
}

func TestResolverKeepsFirstMessageOnProtocolLaneWhenRuntimeIsUnavailable(t *testing.T) {
	resolver := NewResolver(resolverSnapshotRepo{}, resolverHealth{allowed: map[string]bool{}}, AdapterBrowserConsumer)
	route, err := resolver.Resolve(context.Background(), 1, ResolveRequest{
		MessageKind: "text", AllowFirstMessage: true,
	})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if route.Adapter != AdapterProtocolIM || route.Available || route.Reason != "no_executable_adapter" {
		t.Fatalf("first-message route = %+v, want protocol unavailable plan", route)
	}
}

func TestResolverDoesNotReturnDisabledFallback(t *testing.T) {
	resolver := NewResolver(nil, resolverHealth{allowed: map[string]bool{
		AdapterBrowserConsumer: false,
	}}, AdapterBrowserConsumer)
	route, err := resolver.Resolve(context.Background(), 1, ResolveRequest{
		MessageKind: "text", HasConversation: true,
	})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if route.Adapter != "" || route.Available || route.Capability != NameMessageTextExisting || route.Reason != "no_available_adapter" {
		t.Fatalf("disabled fallback route = %+v, want no executable adapter", route)
	}
}

func TestResolverKeepsFirstMessageOnProtocolLaneWhenHealthIsBlocked(t *testing.T) {
	resolver := NewResolver(nil, resolverHealth{allowed: map[string]bool{
		AdapterProtocolIM: false,
	}}, AdapterProtocolIM, AdapterBrowserConsumer)
	route, err := resolver.Resolve(context.Background(), 1, ResolveRequest{
		MessageKind: "text", AllowFirstMessage: true,
	})
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if route.Adapter != AdapterProtocolIM || route.Available || route.Reason != "no_available_adapter" {
		t.Fatalf("blocked first-message route = %+v, want protocol fail-closed plan", route)
	}
}
