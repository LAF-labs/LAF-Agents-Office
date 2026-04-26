package team

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestGPTOAuthAuthorizeTokenAndActionPostMessage(t *testing.T) {
	b := newTestBroker(t)
	if err := b.ConfigureGPTOAuthClient(gptOAuthClient{
		ID:           "gpt-client",
		Secret:       "client-secret",
		RedirectURIs: []string{"https://chatgpt.com/aip/g-test/oauth/callback"},
		AgentSlug:    "gpt-researcher",
		AgentName:    "GPT Researcher",
		Channel:      "research",
		InviteToken:  "invite-123",
	}); err != nil {
		t.Fatalf("ConfigureGPTOAuthClient: %v", err)
	}

	withoutInvite := httptest.NewRecorder()
	b.handleGPTOAuthAuthorize(withoutInvite, httptest.NewRequest(http.MethodGet, "/gpt/oauth/authorize?response_type=code&client_id=gpt-client&redirect_uri=https%3A%2F%2Fchatgpt.com%2Faip%2Fg-test%2Foauth%2Fcallback&state=abc", nil))
	if withoutInvite.Code != http.StatusForbidden {
		t.Fatalf("authorize without invite status = %d, want %d", withoutInvite.Code, http.StatusForbidden)
	}

	authorizeURL := "/gpt/oauth/authorize?response_type=code&client_id=gpt-client&redirect_uri=https%3A%2F%2Fchatgpt.com%2Faip%2Fg-test%2Foauth%2Fcallback&state=abc&invite_token=invite-123"
	authRec := httptest.NewRecorder()
	b.handleGPTOAuthAuthorize(authRec, httptest.NewRequest(http.MethodGet, authorizeURL, nil))
	if authRec.Code != http.StatusFound {
		t.Fatalf("authorize status = %d, want %d: %s", authRec.Code, http.StatusFound, authRec.Body.String())
	}
	location := authRec.Header().Get("Location")
	redirect, err := url.Parse(location)
	if err != nil {
		t.Fatalf("parse redirect: %v", err)
	}
	if got := redirect.Query().Get("state"); got != "abc" {
		t.Fatalf("redirect state = %q, want abc", got)
	}
	code := redirect.Query().Get("code")
	if code == "" {
		t.Fatalf("redirect did not include code: %s", location)
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", "gpt-client")
	form.Set("client_secret", "client-secret")
	form.Set("code", code)
	form.Set("redirect_uri", "https://chatgpt.com/aip/g-test/oauth/callback")
	tokenReq := httptest.NewRequest(http.MethodPost, "/gpt/oauth/token", strings.NewReader(form.Encode()))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRec := httptest.NewRecorder()
	b.handleGPTOAuthToken(tokenRec, tokenReq)
	if tokenRec.Code != http.StatusOK {
		t.Fatalf("token status = %d, want %d: %s", tokenRec.Code, http.StatusOK, tokenRec.Body.String())
	}
	var tokenBody struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	}
	if err := json.NewDecoder(tokenRec.Body).Decode(&tokenBody); err != nil {
		t.Fatalf("decode token response: %v", err)
	}
	if tokenBody.AccessToken == "" || tokenBody.TokenType != "bearer" {
		t.Fatalf("bad token response: %+v", tokenBody)
	}

	actionBody := []byte(`{"content":"Research update from the connected GPT.","event_id":"evt-gpt-1"}`)
	actionReq := httptest.NewRequest(http.MethodPost, "/gpt/actions/message", bytes.NewReader(actionBody))
	actionReq.Header.Set("Authorization", "Bearer "+tokenBody.AccessToken)
	actionReq.Header.Set("Content-Type", "application/json")
	actionRec := httptest.NewRecorder()
	b.handleGPTActionMessage(actionRec, actionReq)
	if actionRec.Code != http.StatusOK {
		t.Fatalf("action status = %d, want %d: %s", actionRec.Code, http.StatusOK, actionRec.Body.String())
	}

	messages := b.Messages()
	if len(messages) != 1 {
		t.Fatalf("messages len = %d, want 1", len(messages))
	}
	msg := messages[0]
	if msg.From != "gpt-researcher" || msg.Source != "gpt" || msg.Channel != "research" {
		t.Fatalf("unexpected posted message: %+v", msg)
	}
	if msg.Content != "Research update from the connected GPT." {
		t.Fatalf("message content = %q", msg.Content)
	}
}

func TestGPTOAuthRejectsBadRedirectAndClientSecret(t *testing.T) {
	b := newTestBroker(t)
	if err := b.ConfigureGPTOAuthClient(gptOAuthClient{
		ID:           "gpt-client",
		Secret:       "client-secret",
		RedirectURIs: []string{"https://chatgpt.com/aip/g-test/oauth/callback"},
		AgentSlug:    "gpt-researcher",
		Channel:      "general",
	}); err != nil {
		t.Fatalf("ConfigureGPTOAuthClient: %v", err)
	}

	badRedirect := httptest.NewRecorder()
	b.handleGPTOAuthAuthorize(badRedirect, httptest.NewRequest(http.MethodGet, "/gpt/oauth/authorize?response_type=code&client_id=gpt-client&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&state=abc", nil))
	if badRedirect.Code != http.StatusBadRequest {
		t.Fatalf("bad redirect status = %d, want %d", badRedirect.Code, http.StatusBadRequest)
	}

	goodAuthorize := httptest.NewRecorder()
	b.handleGPTOAuthAuthorize(goodAuthorize, httptest.NewRequest(http.MethodGet, "/gpt/oauth/authorize?response_type=code&client_id=gpt-client&redirect_uri=https%3A%2F%2Fchatgpt.com%2Faip%2Fg-test%2Foauth%2Fcallback&state=abc", nil))
	if goodAuthorize.Code != http.StatusFound {
		t.Fatalf("authorize status = %d, want %d", goodAuthorize.Code, http.StatusFound)
	}
	redirect, err := url.Parse(goodAuthorize.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse redirect: %v", err)
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", "gpt-client")
	form.Set("client_secret", "wrong-secret")
	form.Set("code", redirect.Query().Get("code"))
	form.Set("redirect_uri", "https://chatgpt.com/aip/g-test/oauth/callback")
	req := httptest.NewRequest(http.MethodPost, "/gpt/oauth/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	b.handleGPTOAuthToken(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad secret status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}
