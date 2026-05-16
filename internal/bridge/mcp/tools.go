package mcp

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	ToolTaskContext           = "laf_task_context"
	ToolWikiSearch            = "laf_wiki_search"
	ToolExecutionReceiptWrite = "laf_execution_receipt_write"

	PermissionTaskContext  = "mcp:use_task_context"
	PermissionWikiRead     = "wiki:read"
	PermissionReceiptWrite = "execution:receipt_write"
)

type TaskContext struct {
	ProjectID string `json:"project_id,omitempty"`
	TaskID    string `json:"task_id"`
	Text      string `json:"text"`
}

type WikiHit struct {
	Path    string `json:"path"`
	Excerpt string `json:"excerpt"`
}

type ReceiptDraft struct {
	PlanID  string `json:"plan_id,omitempty"`
	Status  string `json:"status"`
	Summary string `json:"summary"`
}

type ReceiptResult struct {
	ID      string `json:"id"`
	PlanID  string `json:"plan_id"`
	Status  string `json:"status"`
	Summary string `json:"summary"`
}

type ContextStore interface {
	TaskContext(ctx context.Context, claims TokenClaims) (TaskContext, error)
	WikiSearch(ctx context.Context, claims TokenClaims, query string, limit int) ([]WikiHit, error)
	WriteReceipt(ctx context.Context, claims TokenClaims, draft ReceiptDraft) (ReceiptResult, error)
}

type Gateway struct {
	Issuer       TokenIssuer
	Store        ContextStore
	StaticToken  string
	StaticClaims *TokenClaims
}

type ToolResult struct {
	Payload any    `json:"payload"`
	Tool    string `json:"tool"`
}

type WikiSearchArgs struct {
	Limit int    `json:"limit,omitempty" jsonschema:"Maximum number of results to return"`
	Query string `json:"query" jsonschema:"Search query"`
}

type ReceiptWriteArgs struct {
	Status  string `json:"status" jsonschema:"completed, failed, or cancelled"`
	Summary string `json:"summary" jsonschema:"Short execution receipt summary"`
}

func (g Gateway) CallTool(ctx context.Context, token, name string, args json.RawMessage) (ToolResult, error) {
	if g.Store == nil {
		return ToolResult{}, fmt.Errorf("bridge MCP context store is not configured")
	}
	claims, err := g.claimsForToken(token)
	if err != nil {
		return ToolResult{}, err
	}
	name = strings.TrimSpace(name)
	switch name {
	case ToolTaskContext:
		if err := requirePermission(claims, PermissionTaskContext); err != nil {
			return ToolResult{}, err
		}
		context, err := g.Store.TaskContext(ctx, claims)
		if err != nil {
			return ToolResult{}, err
		}
		return ToolResult{Tool: name, Payload: context}, nil
	case ToolWikiSearch:
		if err := requirePermission(claims, PermissionWikiRead); err != nil {
			return ToolResult{}, err
		}
		var decoded WikiSearchArgs
		if err := json.Unmarshal(args, &decoded); err != nil {
			return ToolResult{}, err
		}
		if strings.TrimSpace(decoded.Query) == "" {
			return ToolResult{}, fmt.Errorf("query is required")
		}
		if decoded.Limit <= 0 || decoded.Limit > 20 {
			decoded.Limit = 5
		}
		hits, err := g.Store.WikiSearch(ctx, claims, decoded.Query, decoded.Limit)
		if err != nil {
			return ToolResult{}, err
		}
		return ToolResult{Tool: name, Payload: hits}, nil
	case ToolExecutionReceiptWrite:
		if err := requirePermission(claims, PermissionReceiptWrite); err != nil {
			return ToolResult{}, err
		}
		var decoded ReceiptWriteArgs
		if err := json.Unmarshal(args, &decoded); err != nil {
			return ToolResult{}, err
		}
		draft := ReceiptDraft{
			PlanID:  claims.PlanID,
			Status:  strings.TrimSpace(decoded.Status),
			Summary: strings.TrimSpace(decoded.Summary),
		}
		if draft.Status == "" {
			return ToolResult{}, fmt.Errorf("status is required")
		}
		if draft.Summary == "" {
			return ToolResult{}, fmt.Errorf("summary is required")
		}
		receipt, err := g.Store.WriteReceipt(ctx, claims, draft)
		if err != nil {
			return ToolResult{}, err
		}
		return ToolResult{Tool: name, Payload: receipt}, nil
	default:
		return ToolResult{}, fmt.Errorf("unknown bridge MCP tool %q", name)
	}
}

func (g Gateway) claimsForToken(token string) (TokenClaims, error) {
	if g.StaticClaims != nil {
		if subtle.ConstantTimeCompare([]byte(strings.TrimSpace(token)), []byte(strings.TrimSpace(g.StaticToken))) != 1 {
			return TokenClaims{}, ErrInvalidToken
		}
		claims := *g.StaticClaims
		if claims.ExpiresAt <= time.Now().Unix() {
			return TokenClaims{}, ErrExpiredToken
		}
		return claims, nil
	}
	return g.Issuer.Validate(token)
}

func requirePermission(claims TokenClaims, permission string) error {
	for _, current := range claims.Permissions {
		if current == permission {
			return nil
		}
	}
	return fmt.Errorf("permission required: %s", permission)
}
