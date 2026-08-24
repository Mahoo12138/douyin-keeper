package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
	"github.com/mahoo12138/douyin-keeper/backend/internal/auth"
)

// RefreshCookieName is the HttpOnly cookie carrying the web refresh token
// (docs/13 §4). SameSite=Lax, Secure is added by the reverse proxy in prod.
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
	s.setRefreshCookie(w, res)
	writeCreated(w, authResponse(res))
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, r, apperr.Validation(apperr.CodeConflict, "invalid body"))
		return
	}
	res, err := s.auth.Login(r.Context(), req.Username, req.Password, auth.ClientWeb)
	if err != nil {
		writeError(w, r, err)
		return
	}
	s.setRefreshCookie(w, res)
	writeOK(w, authResponse(res))
}

// handleRefresh rotates the refresh token. Web clients send the HttpOnly
// cookie; the mini client sends the token in the body (docs/13 §4).
func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	if err := validateRequestOrigin(r); err != nil {
		writeError(w, r, err)
		return
	}
	token := ""
	if c, err := r.Cookie(RefreshCookieName); err == nil {
		token = c.Value
	}
	var req refreshReq
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.RefreshToken != nil && *req.RefreshToken != "" {
		token = *req.RefreshToken
	}
	res, err := s.auth.Refresh(r.Context(), token, auth.ClientWeb)
	if err != nil {
		writeError(w, r, err)
		return
	}
	s.setRefreshCookie(w, res)
	writeOK(w, authResponse(res))
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
	s.clearRefreshCookie(w)
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
	s.clearRefreshCookie(w)
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
	writeOK(w, authResponse(res))
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
	writeOK(w, authResponse(res))
}

func (s *Server) setRefreshCookie(w http.ResponseWriter, res auth.SessionResult) {
	if res.RefreshToken == "" {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: RefreshCookieName, Value: res.RefreshToken,
		Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Expires: time.Now().Add(s.refreshTTL),
	})
}

func (s *Server) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: RefreshCookieName, Value: "", Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
}
