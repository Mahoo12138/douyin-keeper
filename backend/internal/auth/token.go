package auth

import (
	"encoding/base64"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/mahoo12138/douyin-keeper/backend/internal/infra/cryptox"
)

var ErrInvalidToken = errors.New("auth: invalid access token")

// AccessClaims is the short-lived JWT payload (docs/13 §4). It carries no
// entitlement data.
type AccessClaims struct {
	Sid    string `json:"sid"`    // auth_session public id
	Role   Role   `json:"role"`
	Client ClientType `json:"client"`
	jwt.RegisteredClaims
}

// IssueAccess signs a 15-minute access token.
func IssueAccess(secret []byte, ttl time.Duration, user *User, sessionPub string, client ClientType, now time.Time) (string, error) {
	claims := AccessClaims{
		Sid:    sessionPub,
		Role:   user.Role,
		Client: client,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.PublicID.String(),
			Issuer:    "douyin-keeper",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// ParseAccess verifies signature + expiry and returns the claims.
func ParseAccess(secret []byte, tokenString string) (*AccessClaims, error) {
	claims := &AccessClaims{}
	tok, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !tok.Valid {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

// NewRefreshToken returns a 256-bit random token and its keyed hash. Only the
// hash is persisted (docs/13 §4).
func NewRefreshToken(pepper []byte) (token string, hash []byte, err error) {
	raw, err := cryptox.RandomBytes(32)
	if err != nil {
		return "", nil, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	hash = HashRefreshToken(pepper, token)
	return token, hash, nil
}

// HashRefreshToken computes HMAC-SHA-256(pepper, token).
func HashRefreshToken(pepper []byte, token string) []byte {
	return cryptox.HMACSHA256(pepper, []byte(token))
}

// TokenFingerprint is the first 10 hex chars of the keyed hash, for audit only.
func TokenFingerprint(pepper []byte, token string) string {
	return cryptox.HexFingerprint(HashRefreshToken(pepper, token), 10)
}