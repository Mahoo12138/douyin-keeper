package auth

import (
	"context"
	"fmt"
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
	b, err := cryptox.RandomBytes(5)
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
		return s.sessions.CreateLinkCode(tctx, lc)
	})
	if err != nil {
		return nil, "", err
	}
	return lc, code, nil
}

// WechatMiniStub is the default WechatExchanger until M4 wires the real
// exchange with WECHAT_APP_ID/SECRET.
type WechatMiniStub struct{}

func (WechatMiniStub) ExchangeForSubject(_ context.Context, _ string) (string, error) {
	return "", apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat mini login is not enabled yet")
}

// LinkWechatMini binds a new wechat identity (M4). Stub keeps the contract.
func (s *Service) LinkWechatMini(ctx context.Context, principalID int64, wechatCode, linkCode string) (SessionResult, error) {
	if s.wechat == nil {
		return SessionResult{}, apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat mini login is not enabled yet")
	}
	_ = principalID
	_ = wechatCode
	_ = linkCode
	return SessionResult{}, apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat mini login is not enabled yet")
}

// LoginWechatMini authenticates an already-linked wechat identity (M4).
func (s *Service) LoginWechatMini(ctx context.Context, wechatCode string) (SessionResult, error) {
	_ = wechatCode
	return SessionResult{}, apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal, "wechat mini login is not enabled yet")
}