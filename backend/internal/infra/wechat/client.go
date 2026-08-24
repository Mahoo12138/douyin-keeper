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
	"time"

	"github.com/mahoo12138/douyin-keeper/backend/internal/apperr"
)

const defaultCode2SessionEndpoint = "https://api.weixin.qq.com/sns/jscode2session"

type Client struct {
	AppID       string
	AppSecret   string
	HTTPClient  *http.Client
	EndpointURL string
}

func NewClient(appID, appSecret string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{AppID: appID, AppSecret: appSecret, HTTPClient: httpClient,
		EndpointURL: defaultCode2SessionEndpoint}
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
