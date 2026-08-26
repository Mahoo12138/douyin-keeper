package asynqworker

import "github.com/mahoo12138/douyin-keeper/backend/internal/account"

func accountMatchesUser(acct *account.Account, userID int64) bool {
	return acct != nil && acct.UserID == userID
}
