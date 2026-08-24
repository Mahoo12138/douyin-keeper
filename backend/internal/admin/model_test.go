package admin

import (
	"context"
	"testing"
)

type repositoryStub struct {
	limit int
}

func (r *repositoryStub) ListUserSummaries(_ context.Context, limit int) ([]UserSummary, error) {
	r.limit = limit
	return nil, nil
}

func (r *repositoryStub) ListAccountSummaries(_ context.Context, limit int) ([]AccountSummary, error) {
	r.limit = limit
	return nil, nil
}

func TestServiceClampsUserListLimit(t *testing.T) {
	for _, test := range []struct {
		name  string
		input int
		want  int
	}{
		{name: "default", input: 0, want: 50},
		{name: "negative default", input: -1, want: 50},
		{name: "bounded", input: 20, want: 20},
		{name: "maximum", input: 500, want: 100},
	} {
		t.Run(test.name, func(t *testing.T) {
			repo := &repositoryStub{}
			if _, err := NewService(repo).ListUsers(context.Background(), test.input); err != nil {
				t.Fatalf("ListUsers() error = %v", err)
			}
			if repo.limit != test.want {
				t.Fatalf("repository limit = %d, want %d", repo.limit, test.want)
			}
		})
	}
}

func TestServiceClampsAccountListLimit(t *testing.T) {
	for _, test := range []struct {
		name  string
		input int
		want  int
	}{
		{name: "default", input: 0, want: 50},
		{name: "bounded", input: 24, want: 24},
		{name: "maximum", input: 500, want: 100},
	} {
		t.Run(test.name, func(t *testing.T) {
			repo := &repositoryStub{}
			if _, err := NewService(repo).ListAccounts(context.Background(), test.input); err != nil {
				t.Fatalf("ListAccounts() error = %v", err)
			}
			if repo.limit != test.want {
				t.Fatalf("repository limit = %d, want %d", repo.limit, test.want)
			}
		})
	}
}
