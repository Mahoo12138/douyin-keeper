package webapi

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	cookieSession = "huohua_session"
	cookieCSRF    = "huohua_csrf"
)

type AuthUser struct {
	ID       int64
	PublicID string
	Email    string
	Role     string
	Status   string
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func randomToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func (s *Server) cookieSecure(c *gin.Context) bool {
	if s.cfg != nil && s.cfg.CookieSecure {
		return true
	}
	return requestIsHTTPS(c)
}

func requestIsHTTPS(c *gin.Context) bool {
	if c == nil || c.Request == nil {
		return false
	}
	if c.Request.TLS != nil {
		return true
	}
	proto := strings.TrimSpace(c.GetHeader("X-Forwarded-Proto"))
	if proto == "" {
		proto = strings.TrimSpace(c.GetHeader("X-Forwarded-Protocol"))
	}
	if i := strings.IndexByte(proto, ','); i >= 0 {
		proto = proto[:i]
	}
	return strings.EqualFold(strings.TrimSpace(proto), "https")
}

func cookieExpires(maxAge int) time.Time {
	if maxAge > 0 {
		return time.Now().Add(time.Duration(maxAge) * time.Second)
	}
	if maxAge < 0 {
		return time.Unix(1, 0)
	}
	return time.Time{}
}

func (s *Server) writeCookie(c *gin.Context, name, value string, maxAge int, httpOnly bool) {
	ck := &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		Expires:  cookieExpires(maxAge),
		HttpOnly: httpOnly,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.cookieSecure(c),
	}
	http.SetCookie(c.Writer, ck)
}

func (s *Server) setCookies(c *gin.Context, session, csrf string, maxAge int) {
	s.writeCookie(c, cookieSession, session, maxAge, true)
	s.writeCookie(c, cookieCSRF, csrf, maxAge, false)
}

func (s *Server) issueCSRF(c *gin.Context) {
	token, err := randomToken()
	if err != nil {
		fail(c, http.StatusInternalServerError, "internal", "无法签发令牌")
		return
	}
	c.Header("Cache-Control", "no-store")
	s.writeCookie(c, cookieCSRF, token, 12*3600, false)
	ok(c, gin.H{"csrf": token})
}

func csrfHeader(c *gin.Context) string {
	return strings.TrimSpace(c.GetHeader("X-CSRF-Token"))
}

func csrfCookieValues(c *gin.Context) []string {
	var out []string
	if c == nil || c.Request == nil {
		return out
	}
	for _, ck := range c.Request.Cookies() {
		if ck != nil && ck.Name == cookieCSRF && ck.Value != "" {
			out = append(out, ck.Value)
		}
	}
	return out
}

func tokenEq(a, b string) bool {
	if a == "" || b == "" || len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func csrfOK(header string, cookies []string) bool {
	if header == "" {
		return false
	}
	for _, cookie := range cookies {
		if tokenEq(cookie, header) {
			return true
		}
	}
	return false
}

func (s *Server) requireCSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		if !csrfOK(csrfHeader(c), csrfCookieValues(c)) {
			fail(c, http.StatusForbidden, "csrf", "缺少或无效的 CSRF 令牌")
			c.Abort()
			return
		}
		c.Next()
	}
}

func (s *Server) requireSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := readCookie(c, cookieSession)
		if raw == "" {
			fail(c, http.StatusUnauthorized, "unauthorized", "请先登录")
			c.Abort()
			return
		}
		u, err := s.loadSessionUser(c, raw)
		if err != nil || u == nil {
			fail(c, http.StatusUnauthorized, "unauthorized", "登录已失效")
			c.Abort()
			return
		}
		if u.Status != "active" {
			fail(c, http.StatusForbidden, "disabled", "账号已停用")
			c.Abort()
			return
		}
		c.Set("auth_user", u)
		c.Next()
	}
}

func (s *Server) loadSessionUser(c *gin.Context, raw string) (*AuthUser, error) {
	var u AuthUser
	var revoked sql.NullTime
	err := s.db.QueryRowContext(c.Request.Context(), `
		SELECT u.id, u.public_id, u.email, u.role, u.status, s.revoked_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`, hashToken(raw)).Scan(
		&u.ID, &u.PublicID, &u.Email, &u.Role, &u.Status, &revoked,
	)
	if err != nil {
		return nil, err
	}
	if revoked.Valid {
		return nil, errRevoked
	}
	return &u, nil
}

var errRevoked = errString("session revoked")

type errString string

func (e errString) Error() string { return string(e) }

func currentUser(c *gin.Context) *AuthUser {
	v, ok := c.Get("auth_user")
	if !ok {
		return nil
	}
	u, _ := v.(*AuthUser)
	return u
}
