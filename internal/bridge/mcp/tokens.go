package mcp

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
)

var (
	ErrInvalidToken = errors.New("invalid bridge MCP token")
	ErrExpiredToken = errors.New("bridge MCP token expired")
)

type TokenIssuer struct {
	Now    func() time.Time
	Secret []byte
	TTL    time.Duration
}

type TokenClaims struct {
	ExpiresAt   int64    `json:"exp"`
	Permissions []string `json:"permissions"`
	PlanID      string   `json:"plan_id"`
	ProjectID   string   `json:"project_id,omitempty"`
	TaskID      string   `json:"task_id,omitempty"`
	TeamID      string   `json:"team_id"`
}

func NewTokenIssuer(secret []byte) TokenIssuer {
	return TokenIssuer{Secret: secret, TTL: 15 * time.Minute}
}

func GenerateSecret() ([]byte, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	return secret, nil
}

func (i TokenIssuer) Issue(plan bridge.ExecutionPlan) (string, TokenClaims, error) {
	if len(i.Secret) == 0 {
		return "", TokenClaims{}, errors.New("bridge MCP token secret is required")
	}
	now := i.now()
	expiresAt := now.Add(i.ttl())
	if parsed, err := time.Parse(time.RFC3339, plan.ExpiresAt); err == nil && parsed.Before(expiresAt) {
		expiresAt = parsed
	}
	claims := TokenClaims{
		ExpiresAt:   expiresAt.Unix(),
		Permissions: uniquePermissions(plan.EffectivePermissions),
		PlanID:      strings.TrimSpace(plan.ID),
		ProjectID:   stringPtr(plan.ProjectID),
		TaskID:      stringPtr(plan.TaskID),
		TeamID:      strings.TrimSpace(plan.TeamID),
	}
	token, err := i.sign(claims)
	if err != nil {
		return "", TokenClaims{}, err
	}
	return token, claims, nil
}

func (i TokenIssuer) Validate(token string) (TokenClaims, error) {
	if len(i.Secret) == 0 {
		return TokenClaims{}, errors.New("bridge MCP token secret is required")
	}
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 2 {
		return TokenClaims{}, ErrInvalidToken
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return TokenClaims{}, ErrInvalidToken
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return TokenClaims{}, ErrInvalidToken
	}
	mac := hmac.New(sha256.New, i.Secret)
	mac.Write(payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return TokenClaims{}, ErrInvalidToken
	}
	var claims TokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return TokenClaims{}, ErrInvalidToken
	}
	if claims.ExpiresAt <= i.now().Unix() {
		return TokenClaims{}, ErrExpiredToken
	}
	return claims, nil
}

func (i TokenIssuer) sign(claims TokenClaims) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, i.Secret)
	mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (i TokenIssuer) now() time.Time {
	if i.Now != nil {
		return i.Now()
	}
	return time.Now()
}

func (i TokenIssuer) ttl() time.Duration {
	if i.TTL > 0 {
		return i.TTL
	}
	return 15 * time.Minute
}

func uniquePermissions(raw json.RawMessage) []string {
	var values []string
	_ = json.Unmarshal(raw, &values)
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		normalized := strings.TrimSpace(value)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}
	return out
}

func stringPtr(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
