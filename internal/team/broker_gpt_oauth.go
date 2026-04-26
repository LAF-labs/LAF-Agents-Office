package team

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	gptOAuthCodeTTL  = 10 * time.Minute
	gptOAuthTokenTTL = 30 * 24 * time.Hour
)

type gptOAuthClient struct {
	ID           string   `json:"id"`
	Secret       string   `json:"secret,omitempty"`
	RedirectURIs []string `json:"redirect_uris,omitempty"`
	AgentSlug    string   `json:"agent_slug"`
	AgentName    string   `json:"agent_name,omitempty"`
	Channel      string   `json:"channel,omitempty"`
	InviteToken  string   `json:"invite_token,omitempty"`
}

type gptOAuthGrant struct {
	Code        string    `json:"code"`
	ClientID    string    `json:"client_id"`
	RedirectURI string    `json:"redirect_uri"`
	Scope       string    `json:"scope,omitempty"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type gptOAuthToken struct {
	Token     string    `json:"token"`
	ClientID  string    `json:"client_id"`
	AgentSlug string    `json:"agent_slug"`
	Channel   string    `json:"channel,omitempty"`
	ExpiresAt time.Time `json:"expires_at"`
}

func (b *Broker) ensureGPTOAuthMapsLocked() {
	if b.gptOAuthClients == nil {
		b.gptOAuthClients = make(map[string]gptOAuthClient)
	}
	if b.gptOAuthCodes == nil {
		b.gptOAuthCodes = make(map[string]gptOAuthGrant)
	}
	if b.gptOAuthTokens == nil {
		b.gptOAuthTokens = make(map[string]gptOAuthToken)
	}
}

func (b *Broker) ConfigureGPTOAuthClient(client gptOAuthClient) error {
	client.ID = strings.TrimSpace(client.ID)
	client.Secret = strings.TrimSpace(client.Secret)
	client.AgentSlug = normalizeActorSlug(client.AgentSlug)
	client.AgentName = strings.TrimSpace(client.AgentName)
	client.Channel = normalizeChannelSlug(client.Channel)
	client.InviteToken = strings.TrimSpace(client.InviteToken)
	if client.ID == "" {
		return fmt.Errorf("client id required")
	}
	if client.Secret == "" {
		return fmt.Errorf("client secret required")
	}
	if client.AgentSlug == "" {
		return fmt.Errorf("agent slug required")
	}
	if client.AgentName == "" {
		client.AgentName = client.AgentSlug
	}
	if len(client.RedirectURIs) == 0 {
		return fmt.Errorf("at least one redirect uri required")
	}
	redirects := make([]string, 0, len(client.RedirectURIs))
	seen := make(map[string]struct{}, len(client.RedirectURIs))
	for _, raw := range client.RedirectURIs {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return fmt.Errorf("invalid redirect uri: %s", raw)
		}
		if _, ok := seen[raw]; ok {
			continue
		}
		seen[raw] = struct{}{}
		redirects = append(redirects, raw)
	}
	if len(redirects) == 0 {
		return fmt.Errorf("at least one redirect uri required")
	}
	client.RedirectURIs = redirects

	b.mu.Lock()
	defer b.mu.Unlock()
	b.ensureGPTOAuthMapsLocked()
	b.gptOAuthClients[client.ID] = client
	return nil
}

func (b *Broker) handleGPTOAuthClients(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		b.mu.Lock()
		b.ensureGPTOAuthMapsLocked()
		clients := make([]gptOAuthClient, 0, len(b.gptOAuthClients))
		for _, client := range b.gptOAuthClients {
			client.Secret = ""
			client.InviteToken = ""
			clients = append(clients, client)
		}
		b.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"clients": clients})
	case http.MethodPost:
		var body gptOAuthClient
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		if err := b.ConfigureGPTOAuthClient(body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		b.mu.Lock()
		err := b.saveLocked()
		b.mu.Unlock()
		if err != nil {
			http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "client_id": strings.TrimSpace(body.ID)})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (b *Broker) handleGPTOAuthAuthorize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	if q.Get("response_type") != "code" {
		http.Error(w, "unsupported response_type", http.StatusBadRequest)
		return
	}
	clientID := strings.TrimSpace(q.Get("client_id"))
	redirectURI := strings.TrimSpace(q.Get("redirect_uri"))
	state := strings.TrimSpace(q.Get("state"))
	if state == "" {
		http.Error(w, "state required", http.StatusBadRequest)
		return
	}

	b.mu.Lock()
	b.ensureGPTOAuthMapsLocked()
	client, ok := b.gptOAuthClients[clientID]
	if !ok {
		b.mu.Unlock()
		http.Error(w, "unknown client", http.StatusBadRequest)
		return
	}
	if !gptOAuthRedirectAllowed(client, redirectURI) {
		b.mu.Unlock()
		http.Error(w, "redirect_uri not allowed", http.StatusBadRequest)
		return
	}
	if client.InviteToken != "" && strings.TrimSpace(q.Get("invite_token")) != client.InviteToken {
		b.mu.Unlock()
		http.Error(w, "invite token required", http.StatusForbidden)
		return
	}
	code := generateToken()
	b.gptOAuthCodes[code] = gptOAuthGrant{
		Code:        code,
		ClientID:    client.ID,
		RedirectURI: redirectURI,
		Scope:       strings.TrimSpace(q.Get("scope")),
		ExpiresAt:   time.Now().UTC().Add(gptOAuthCodeTTL),
	}
	b.mu.Unlock()

	redirect, _ := url.Parse(redirectURI)
	values := redirect.Query()
	values.Set("code", code)
	values.Set("state", state)
	redirect.RawQuery = values.Encode()
	http.Redirect(w, r, redirect.String(), http.StatusFound)
}

func gptOAuthRedirectAllowed(client gptOAuthClient, redirectURI string) bool {
	for _, allowed := range client.RedirectURIs {
		if redirectURI == allowed {
			return true
		}
	}
	return false
}

func (b *Broker) handleGPTOAuthToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	req, err := decodeGPTOAuthTokenRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.GrantType != "authorization_code" {
		http.Error(w, "unsupported grant_type", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	b.mu.Lock()
	b.ensureGPTOAuthMapsLocked()
	client, ok := b.gptOAuthClients[req.ClientID]
	if !ok {
		b.mu.Unlock()
		http.Error(w, "unknown client", http.StatusBadRequest)
		return
	}
	if client.Secret != req.ClientSecret {
		b.mu.Unlock()
		http.Error(w, "invalid client credentials", http.StatusUnauthorized)
		return
	}
	grant, ok := b.gptOAuthCodes[req.Code]
	if !ok || grant.ClientID != req.ClientID || grant.RedirectURI != req.RedirectURI || now.After(grant.ExpiresAt) {
		b.mu.Unlock()
		http.Error(w, "invalid authorization code", http.StatusBadRequest)
		return
	}
	delete(b.gptOAuthCodes, req.Code)
	accessToken := generateToken()
	expiresAt := now.Add(gptOAuthTokenTTL)
	b.gptOAuthTokens[accessToken] = gptOAuthToken{
		Token:     accessToken,
		ClientID:  client.ID,
		AgentSlug: client.AgentSlug,
		Channel:   client.Channel,
		ExpiresAt: expiresAt,
	}
	if err := b.saveLocked(); err != nil {
		delete(b.gptOAuthTokens, accessToken)
		b.mu.Unlock()
		http.Error(w, "failed to persist broker state", http.StatusInternalServerError)
		return
	}
	b.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token": accessToken,
		"token_type":   "bearer",
		"expires_in":   int(gptOAuthTokenTTL.Seconds()),
	})
}

type gptOAuthTokenRequest struct {
	GrantType    string `json:"grant_type"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Code         string `json:"code"`
	RedirectURI  string `json:"redirect_uri"`
}

func decodeGPTOAuthTokenRequest(r *http.Request) (gptOAuthTokenRequest, error) {
	var req gptOAuthTokenRequest
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.Contains(contentType, "application/json") {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			return req, fmt.Errorf("invalid json")
		}
	} else {
		if err := r.ParseForm(); err != nil {
			return req, fmt.Errorf("invalid form")
		}
		req = gptOAuthTokenRequest{
			GrantType:    r.Form.Get("grant_type"),
			ClientID:     r.Form.Get("client_id"),
			ClientSecret: r.Form.Get("client_secret"),
			Code:         r.Form.Get("code"),
			RedirectURI:  r.Form.Get("redirect_uri"),
		}
	}
	req.GrantType = strings.TrimSpace(req.GrantType)
	req.ClientID = strings.TrimSpace(req.ClientID)
	req.ClientSecret = strings.TrimSpace(req.ClientSecret)
	req.Code = strings.TrimSpace(req.Code)
	req.RedirectURI = strings.TrimSpace(req.RedirectURI)
	if req.ClientID == "" || req.ClientSecret == "" || req.Code == "" || req.RedirectURI == "" {
		return req, fmt.Errorf("client_id, client_secret, code, and redirect_uri are required")
	}
	return req, nil
}

func (b *Broker) gptActionToken(r *http.Request) (gptOAuthToken, gptOAuthClient, bool) {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return gptOAuthToken{}, gptOAuthClient{}, false
	}
	raw := strings.TrimSpace(auth[len("Bearer "):])
	b.mu.Lock()
	defer b.mu.Unlock()
	b.ensureGPTOAuthMapsLocked()
	token, ok := b.gptOAuthTokens[raw]
	if !ok || time.Now().UTC().After(token.ExpiresAt) {
		return gptOAuthToken{}, gptOAuthClient{}, false
	}
	client, ok := b.gptOAuthClients[token.ClientID]
	if !ok {
		return gptOAuthToken{}, gptOAuthClient{}, false
	}
	return token, client, true
}

func (b *Broker) handleGPTActionMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token, client, ok := b.gptActionToken(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var body struct {
		Channel string   `json:"channel"`
		Title   string   `json:"title"`
		Content string   `json:"content"`
		EventID string   `json:"event_id"`
		Tagged  []string `json:"tagged"`
		ReplyTo string   `json:"reply_to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	content := strings.TrimSpace(body.Content)
	if content == "" {
		http.Error(w, "content required", http.StatusBadRequest)
		return
	}
	channel := token.Channel
	if strings.TrimSpace(body.Channel) != "" {
		channel = normalizeChannelSlug(body.Channel)
	}
	if channel == "" {
		channel = "general"
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = "GPT action"
	}
	msg, duplicate, err := b.PostAutomationMessage(token.AgentSlug, channel, title, content, strings.TrimSpace(body.EventID), "gpt", client.AgentName, uniqueSlugs(body.Tagged), strings.TrimSpace(body.ReplyTo))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id":        msg.ID,
		"duplicate": duplicate,
		"from":      msg.From,
		"channel":   msg.Channel,
	})
}

func (b *Broker) handleGPTActionsOpenAPI(w http.ResponseWriter, r *http.Request) {
	baseURL := strings.TrimRight(r.URL.Query().Get("base_url"), "/")
	if baseURL == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		baseURL = scheme + "://" + r.Host
	}
	schema := map[string]any{
		"openapi": "3.1.0",
		"info": map[string]any{
			"title":   "WUPHF GPT Actions",
			"version": "0.1.0",
		},
		"servers": []map[string]string{{"url": baseURL}},
		"paths": map[string]any{
			"/gpt/actions/message": map[string]any{
				"post": map[string]any{
					"operationId": "postMessageToWuphf",
					"summary":     "Post a message from this GPT into a WUPHF workspace channel.",
					"requestBody": map[string]any{
						"required": true,
						"content": map[string]any{
							"application/json": map[string]any{
								"schema": map[string]any{
									"type":     "object",
									"required": []string{"content"},
									"properties": map[string]any{
										"channel":  map[string]string{"type": "string", "description": "WUPHF channel slug. Defaults to the OAuth client's channel."},
										"title":    map[string]string{"type": "string"},
										"content":  map[string]string{"type": "string"},
										"event_id": map[string]string{"type": "string", "description": "Optional idempotency key."},
										"tagged":   map[string]any{"type": "array", "items": map[string]string{"type": "string"}},
										"reply_to": map[string]string{"type": "string"},
									},
								},
							},
						},
					},
					"responses": map[string]any{
						"200": map[string]any{"description": "Message accepted"},
					},
					"security": []map[string][]string{{"OAuth2": {}}},
				},
			},
		},
		"components": map[string]any{
			"securitySchemes": map[string]any{
				"OAuth2": map[string]any{
					"type": "oauth2",
					"flows": map[string]any{
						"authorizationCode": map[string]any{
							"authorizationUrl": baseURL + "/gpt/oauth/authorize",
							"tokenUrl":         baseURL + "/gpt/oauth/token",
							"scopes":           map[string]string{"message:write": "Post messages into WUPHF"},
						},
					},
				},
			},
		},
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(schema)
}
