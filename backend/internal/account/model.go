// Package account owns the DouyinAccount lifecycle and user-ownership scope
// (docs/14 §4). It never decrypts sessions or talks to Playwright.
package account

import (
	"time"

	"github.com/google/uuid"
)

type BindingStatus string

const (
	BindingUnbound  BindingStatus = "unbound"
	BindingBinding  BindingStatus = "binding"
	BindingBound    BindingStatus = "bound"
	BindingReleased BindingStatus = "released"
)

type SessionStatus string

const (
	SessionUnknown           SessionStatus = "unknown"
	SessionValid             SessionStatus = "valid"
	SessionExpired           SessionStatus = "expired"
	SessionChallengeRequired SessionStatus = "challenge_required"
)

type RiskStatus string

const (
	RiskNormal      RiskStatus = "normal"
	RiskCoolingDown RiskStatus = "cooling_down"
	RiskPaused      RiskStatus = "paused"
)

type Account struct {
	ID                 int64
	PublicID           uuid.UUID
	UserID             int64
	UserPublicID       uuid.UUID
	PlatformUserID     *string
	Nickname           string
	AvatarURL          *string
	BindingStatus      BindingStatus
	SessionStatus      SessionStatus
	RiskStatus         RiskStatus
	PausedAt           *time.Time
	CooldownUntil      *time.Time
	LastSessionCheckAt *time.Time
	LastFriendSyncAt   *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
	DeletedAt          *time.Time
}

// Summary is the user-facing account-list projection. Operational counters
// are derived by the repository so the Web account list does not need one
// request per account (docs/02 §1.3).
type Summary struct {
	Account            Account
	FriendCount        int
	EnabledTaskCount   int
	TodaySendSucceeded int
	TodaySendFailed    int
}
