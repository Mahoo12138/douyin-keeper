package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

// RefreshCookieName is the HttpOnly cookie carrying the web refresh token
// (docs/13 §4). Secure follows the request's direct TLS or trusted proxy
// protocol, so local HTTP development remains usable while HTTPS deployments
// receive a Secure cookie.
const RefreshCookieName = "dk_refresh"

type registerReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type refreshReq struct {
	RefreshToken *string `json:"refresh_token"`
}

type linkCodeReq struct{}
type wechatLinkReq struct {
	WechatCode string `json:"wechat_code"`
	LinkCode   string `json:"link_code"`
}
type wechatLoginReq struct {
	WechatCode string `json:"wechat_code"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	res, err := s.auth.Register(r.Context(), req.Username, req.Password)
	if err != nil {
		writeError(w, r, err)
		return
	}
	s.setRefreshCookie(w, r, res)
	writeCreated(w, authResponse(res, false))
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	s.handlePasswordLogin(w, r, auth.ClientWeb)
}

func (s *Server) handleMiniLogin(w http.ResponseWriter, r *http.Request) {
	s.handlePasswordLogin(w, r, auth.ClientMini)
}

func (s *Server) handlePasswordLogin(w http.ResponseWriter, r *http.Request, client auth.ClientType) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	res, err := s.auth.Login(r.Context(), req.Username, req.Password, client)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if client == auth.ClientWeb {
		s.setRefreshCookie(w, r, res)
	}
	writeOK(w, authResponse(res, client == auth.ClientMini))
}

// handleRefresh rotates the refresh token. Web clients send the HttpOnly
// cookie; the mini client sends the token in the body (docs/13 §4).
func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	if err := validateRequestOrigin(r); err != nil {
		writeError(w, r, err)
		return
	}
	token, client, err := refreshInput(r)
	if err != nil {
		writeError(w, r, err)
		return
	}
	res, err := s.auth.Refresh(r.Context(), token, client)
	if err != nil {
		writeError(w, r, err)
		return
	}
	if client == auth.ClientWeb {
		s.setRefreshCookie(w, r, res)
	}
	writeOK(w, authResponse(res, client == auth.ClientMini))
}

func refreshInput(r *http.Request) (string, auth.ClientType, error) {
	if c, err := r.Cookie(RefreshCookieName); err == nil && c.Value != "" {
		return c.Value, auth.ClientWeb, nil
	}
	var req refreshReq
	if r.Body != nil {
		err := json.NewDecoder(r.Body).Decode(&req)
		if err != nil && err != io.EOF {
			return "", "", apperr.Validation(apperr.CodeConflict, "invalid refresh body")
		}
	}
	if req.RefreshToken != nil && *req.RefreshToken != "" {
		return *req.RefreshToken, auth.ClientMini, nil
	}
	return "", auth.ClientWeb, nil
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if err := validateRequestOrigin(r); err != nil {
		writeError(w, r, err)
		return
	}
	p := auth.MustPrincipal(r.Context())
	if err := s.auth.Logout(r.Context(), p.SessionID); err != nil {
		writeError(w, r, err)
		return
	}
	s.clearRefreshCookie(w, r)
	writeNoContent(w)
}

func (s *Server) handleLogoutAll(w http.ResponseWriter, r *http.Request) {
	if err := validateRequestOrigin(r); err != nil {
		writeError(w, r, err)
		return
	}
	p := auth.MustPrincipal(r.Context())
	if err := s.auth.LogoutAll(r.Context(), p.UserID); err != nil {
		writeError(w, r, err)
		return
	}
	s.clearRefreshCookie(w, r)
	writeNoContent(w)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	u, err := s.auth.GetUserByPublicID(r.Context(), p.UserPublicID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, userView(u))
}

// handleLinkCodes creates an 8-char one-time code for the email-free mini
// binding (docs/13 §5). The exchange itself is wired at M4.
func (s *Server) handleCreateLinkCode(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	hold, code, err := s.auth.CreateLinkCode(r.Context(), p.UserID)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeCreated(w, LinkCodeView{Code: code, ExpiresAt: hold.ExpiresAt})
}

func (s *Server) handleWechatLink(w http.ResponseWriter, r *http.Request) {
	p := auth.MustPrincipal(r.Context())
	var req wechatLinkReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	res, err := s.auth.LinkWechatMini(r.Context(), p.UserID, req.WechatCode, req.LinkCode)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, authResponse(res, true))
}

func (s *Server) handleWechatLogin(w http.ResponseWriter, r *http.Request) {
	var req wechatLoginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	res, err := s.auth.LoginWechatMini(r.Context(), req.WechatCode)
	if err != nil {
		writeError(w, r, err)
		return
	}
	writeOK(w, authResponse(res, true))
}

func (s *Server) setRefreshCookie(w http.ResponseWriter, r *http.Request, res auth.SessionResult) {
	if res.RefreshToken == "" {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: RefreshCookieName, Value: res.RefreshToken,
		Path: "/", HttpOnly: true, Secure: requestScheme(r) == "https", SameSite: http.SameSiteLaxMode,
		Expires: time.Now().Add(s.refreshTTL),
	})
}

func (s *Server) clearRefreshCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: RefreshCookieName, Value: "", Path: "/", HttpOnly: true,
		Secure: requestScheme(r) == "https", SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}
