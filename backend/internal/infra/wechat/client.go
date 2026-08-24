// Package wechat contains the small HTTP adapter used to exchange a
// mini-program wx.login code for a provider subject. It deliberately returns
// only the stable subject needed by auth; session_key is never persisted.
package wechat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

const defaultCode2SessionEndpoint = "https://api.weixin.qq.com/sns/jscode2session"

type Client struct {
	AppID       string
	AppSecret   string
	HTTPClient  *http.Client
	EndpointURL string
	TokenURL    string
	SendURL     string
	mu          sync.Mutex
	accessToken string
	tokenExpiry time.Time
}

func NewClient(appID, appSecret string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{AppID: appID, AppSecret: appSecret, HTTPClient: httpClient,
		EndpointURL: defaultCode2SessionEndpoint,
		TokenURL:    "https://api.weixin.qq.com/cgi-bin/token",
		SendURL:     "https://api.weixin.qq.com/cgi-bin/message/subscribe/send"}
}

type SubscriptionValue struct {
	Value string `json:"value"`
}

type SubscriptionMessage struct {
	ToUser     string                       `json:"touser"`
	TemplateID string                       `json:"template_id"`
	Page       string                       `json:"page,omitempty"`
	Data       map[string]SubscriptionValue `json:"data"`
}

type code2SessionResponse struct {
	OpenID  string `json:"openid"`
	UnionID string `json:"unionid"`
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

// ExchangeForSubject implements auth.WechatExchanger. The OpenID is the
// stable per-mini-program subject; the sensitive session_key is intentionally
// ignored and never returned to the auth domain.
func (c *Client) ExchangeForSubject(ctx context.Context, wechatCode string) (string, error) {
	if c == nil || c.AppID == "" || c.AppSecret == "" {
		return "", apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal,
			"wechat mini login is not enabled yet")
	}
	wechatCode = strings.TrimSpace(wechatCode)
	if wechatCode == "" {
		return "", apperr.Validation(apperr.CodeConflict, "wechat code is required")
	}
	endpoint := c.EndpointURL
	if endpoint == "" {
		endpoint = defaultCode2SessionEndpoint
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindInternal, "invalid wechat endpoint", err)
	}
	query := u.Query()
	query.Set("appid", c.AppID)
	query.Set("secret", c.AppSecret)
	query.Set("js_code", wechatCode)
	query.Set("grant_type", "authorization_code")
	u.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindInternal, "create wechat request failed", err)
	}
	httpClient := c.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", wechatUnavailable(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<10))
	if err != nil {
		return "", wechatUnavailable(err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", wechatUnavailable(fmt.Errorf("wechat http status %d", resp.StatusCode))
	}
	var result code2SessionResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", wechatUnavailable(err)
	}
	if result.ErrCode != 0 || result.OpenID == "" {
		return "", apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindExternal,
			"wechat identity could not be exchanged", fmt.Errorf("wechat errcode=%d errmsg=%s", result.ErrCode, result.ErrMsg))
	}
	return result.OpenID, nil
}

func wechatUnavailable(cause error) error {
	err := apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindTransient,
		"wechat identity service is temporarily unavailable", cause)
	err.Retryable = true
	return err
}

func (c *Client) SendSubscription(ctx context.Context, message SubscriptionMessage) error {
	if c == nil || c.AppID == "" || c.AppSecret == "" {
		return apperr.New(apperr.CodeWechatNotLinked, apperr.KindExternal,
			"wechat notification is not configured")
	}
	if strings.TrimSpace(message.ToUser) == "" || strings.TrimSpace(message.TemplateID) == "" {
		return apperr.Validation(apperr.CodeConflict, "wechat notification target and template are required")
	}
	token, err := c.getAccessToken(ctx)
	if err != nil {
		return err
	}
	body, err := json.Marshal(message)
	if err != nil {
		return apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindInternal, "marshal wechat notification failed", err)
	}
	sendURL := c.SendURL
	if sendURL == "" {
		sendURL = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send"
	}
	u, err := url.Parse(sendURL)
	if err != nil {
		return apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindInternal, "invalid wechat send endpoint", err)
	}
	query := u.Query()
	query.Set("access_token", token)
	u.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), strings.NewReader(string(body)))
	if err != nil {
		return apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindInternal, "create wechat notification request failed", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return wechatUnavailable(err)
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 32<<10))
	if err != nil {
		return wechatUnavailable(err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return wechatUnavailable(fmt.Errorf("wechat notification http status %d", resp.StatusCode))
	}
	var result struct {
		ErrCode *int   `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return wechatUnavailable(err)
	}
	if result.ErrCode == nil {
		return wechatUnavailable(fmt.Errorf("wechat notification response omitted errcode"))
	}
	if *result.ErrCode != 0 {
		return apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindExternal,
			"wechat notification was rejected", fmt.Errorf("wechat errcode=%d errmsg=%s", *result.ErrCode, result.ErrMsg))
	}
	return nil
}

func (c *Client) getAccessToken(ctx context.Context) (string, error) {
	now := time.Now()
	c.mu.Lock()
	if c.accessToken != "" && now.Before(c.tokenExpiry) {
		token := c.accessToken
		c.mu.Unlock()
		return token, nil
	}
	c.mu.Unlock()
	tokenURL := c.TokenURL
	if tokenURL == "" {
		tokenURL = "https://api.weixin.qq.com/cgi-bin/token"
	}
	u, err := url.Parse(tokenURL)
	if err != nil {
		return "", apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindInternal, "invalid wechat token endpoint", err)
	}
	query := u.Query()
	query.Set("grant_type", "client_credential")
	query.Set("appid", c.AppID)
	query.Set("secret", c.AppSecret)
	u.RawQuery = query.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindInternal, "create wechat token request failed", err)
	}
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return "", wechatUnavailable(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<10))
	if err != nil {
		return "", wechatUnavailable(err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", wechatUnavailable(fmt.Errorf("wechat token http status %d", resp.StatusCode))
	}
	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", wechatUnavailable(err)
	}
	if result.ErrCode != 0 || result.AccessToken == "" {
		return "", apperr.Wrap(apperr.CodeWechatNotLinked, apperr.KindExternal,
			"wechat access token was rejected", fmt.Errorf("wechat errcode=%d errmsg=%s", result.ErrCode, result.ErrMsg))
	}
	expiresIn := time.Duration(result.ExpiresIn) * time.Second
	if expiresIn <= time.Minute {
		expiresIn = time.Minute
	}
	c.mu.Lock()
	c.accessToken = result.AccessToken
	c.tokenExpiry = time.Now().Add(expiresIn - time.Minute)
	c.mu.Unlock()
	return result.AccessToken, nil
}

func (c *Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: 10 * time.Second}
}
