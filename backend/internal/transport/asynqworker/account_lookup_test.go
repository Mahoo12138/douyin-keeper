package asynqworker

import (
	"testing"

	"github.com/mahoo12138/douyin-keeper/backend/internal/account"
)

func TestAccountMatchesUserRejectsEmptyOrMismatchedResults(t *testing.T) {
	if accountMatchesUser(nil, 7) {
		t.Fatal("nil account must not match")
	}
	if accountMatchesUser(&account.Account{UserID: 8}, 7) {
		t.Fatal("account owned by another user must not match")
	}
	if !accountMatchesUser(&account.Account{UserID: 7}, 7) {
		t.Fatal("matching account must match")
	}
}
