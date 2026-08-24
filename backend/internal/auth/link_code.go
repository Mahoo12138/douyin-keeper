package auth

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/cryptox"
)

// LinkCode is a one-time, short-lived code binding a WeChat mini client to an
// existing PC user (docs/13 §5). Only the keyed hash is stored.
type LinkCode struct {
	ID              int64
	PublicID        uuid.UUID
	UserID          int64
	CodeHash        []byte
	CodeFingerprint string
	ExpiresAt       time.Time
	ConsumedAt      *time.Time
	CreatedAt       time.Time
}

// LinkCodeAlphabet is the Crockford Base32 alphabet (no I/L/O/U) for
// unambiguous codes.
const LinkCodeAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// MaxActiveLinkCodes bounds concurrent valid codes per user (docs/13 §5.1).
const MaxActiveLinkCodes = 3

// LinkCodeTTL is the default validity window.
const LinkCodeTTL = 5 * time.Minute

// GenerateLinkCode produces an ambiguous-free code like ABCD-EFGH.
func GenerateLinkCode() (string, error) {
	b, err := cryptox.RandomBytes(8)
	if err != nil {
		return "", err
	}
	code := make([]byte, 8)
	for i := range 8 {
		code[i] = LinkCodeAlphabet[b[i]%uint8(len(LinkCodeAlphabet))]
	}
	return fmt.Sprintf("%s-%s", string(code[:4]), string(code[4:])), nil
}

// CreateLinkCode generates and stores a new link code for the user.
func (s *Service) CreateLinkCode(ctx context.Context, userID int64) (*LinkCode, string, error) {
	if userID <= 0 {
		return nil, "", apperr.Validation(apperr.CodeConflict, "user id is required")
	}
	code, err := GenerateLinkCode()
	if err != nil {
		return nil, "", err
	}
	hash := HashRefreshToken(s.refreshPepper, code)
	now := s.now()
	lc := &LinkCode{
		PublicID: uuid.New(), UserID: userID, CodeHash: hash,
		CodeFingerprint: TokenFingerprint(s.refreshPepper, code),
		ExpiresAt:       now.Add(LinkCodeTTL), CreatedAt: now,
	}
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		user, err := s.users.LockUserByID(tctx, userID)
		if err != nil {
			return err
		}
		if !user.IsActive() {
			return apperr.New(apperr.CodeUserDisabled, apperr.KindForbidden, "account is disabled")
		}
		active, err := s.sessions.CountActiveLinkCodes(tctx, userID, now)
		if err != nil {
			return err
		}
		if active >= MaxActiveLinkCodes {
			return apperr.Conflict(apperr.CodeConflict, "too many active link codes")
		}
		return s.sessions.CreateLinkCode(tctx, lc)
	})
	if err != nil {
		return nil, "", err
	}
	return lc, code, nil
}

// NormalizeLinkCode accepts the displayed xxxx-xxxx form case-insensitively
// while keeping one canonical representation for hashing and lookup.
func NormalizeLinkCode(code string) string {
	code = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
	if len(code) == 8 {
		return code[:4] + "-" + code[4:]
	}
	return code
}

// WechatMiniStub preserves an explicit not-linked response when the runtime
// has not been configured with WECHAT_APP_ID/SECRET.
type WechatMiniStub struct{}

func (WechatMiniStub) ExchangeForSubject(_ context.Context, _ string) (string, error) {
	return "", apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat mini login is not enabled yet")
}

// LinkWechatMini exchanges the mini-program login code, atomically consumes a
// user-owned Link Code, and binds the returned provider subject to the current
// user. The external exchange intentionally happens outside the DB tx.
func (s *Service) LinkWechatMini(ctx context.Context, principalID int64, wechatCode, linkCode string) (SessionResult, error) {
	if s.wechat == nil {
		return SessionResult{}, apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat mini login is not enabled yet")
	}
	if principalID <= 0 || strings.TrimSpace(wechatCode) == "" || NormalizeLinkCode(linkCode) == "" {
		return SessionResult{}, apperr.Validation(apperr.CodeConflict, "wechat code and link code are required")
	}
	subject, err := s.wechat.ExchangeForSubject(ctx, strings.TrimSpace(wechatCode))
	if err != nil {
		return SessionResult{}, err
	}
	if subject == "" {
		return SessionResult{}, apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat identity is unavailable")
	}
	user, err := s.users.GetUserByID(ctx, principalID)
	if err != nil {
		return SessionResult{}, err
	}
	if !user.IsActive() {
		return SessionResult{}, apperr.New(apperr.CodeUserDisabled, apperr.KindForbidden, "account is disabled")
	}
	now := s.now()
	canonicalCode := NormalizeLinkCode(linkCode)
	hash := HashRefreshToken(s.refreshPepper, canonicalCode)
	err = s.tx.WithinTx(ctx, func(tctx context.Context) error {
		lc, err := s.sessions.GetLinkCodeByHashForUpdate(tctx, hash)
		if err != nil {
			if app, ok := apperr.As(err); ok && app.Code == apperr.CodeLinkCodeInvalid {
				return apperr.NotFound(apperr.CodeLinkCodeInvalid, "link code is invalid")
			}
			return err
		}
		if lc.UserID != principalID || lc.ConsumedAt != nil {
			return apperr.NotFound(apperr.CodeLinkCodeInvalid, "link code is invalid")
		}
		if !lc.ExpiresAt.After(now) {
			return apperr.Conflict(apperr.CodeLinkCodeExpired, "link code has expired")
		}
		identity := &AuthIdentity{
			UserID: principalID, Provider: "wechat_mini", ProviderSubject: subject,
			CreatedAt: now, UpdatedAt: now,
		}
		if err := s.users.CreateIdentity(tctx, identity); err != nil {
			return err
		}
		return s.sessions.ConsumeLinkCode(tctx, lc.ID, now)
	})
	if err != nil {
		return SessionResult{}, err
	}
	return s.newSession(ctx, user, ClientMini)
}

// LoginWechatMini authenticates an already-linked mini-program identity.
func (s *Service) LoginWechatMini(ctx context.Context, wechatCode string) (SessionResult, error) {
	if s.wechat == nil {
		return SessionResult{}, apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat mini login is not enabled yet")
	}
	if strings.TrimSpace(wechatCode) == "" {
		return SessionResult{}, apperr.Validation(apperr.CodeConflict, "wechat code is required")
	}
	subject, err := s.wechat.ExchangeForSubject(ctx, strings.TrimSpace(wechatCode))
	if err != nil {
		return SessionResult{}, err
	}
	user, err := s.users.GetWechatBySubject(ctx, subject)
	if err != nil {
		if apperr.KindOf(err) == apperr.KindNotFound {
			return SessionResult{}, apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat identity is not linked")
		}
		return SessionResult{}, err
	}
	if !user.IsActive() {
		return SessionResult{}, apperr.New(apperr.CodeUserDisabled, apperr.KindForbidden, "account is disabled")
	}
	return s.newSession(ctx, user, ClientMini)
}
