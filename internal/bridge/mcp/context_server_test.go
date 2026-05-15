package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
)

func TestExpiredTokenDenied(t *testing.T) {
	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)
	issuer := NewTokenIssuer([]byte("test-secret-test-secret-test-secret"))
	issuer.Now = func() time.Time { return now }
	issuer.TTL = time.Minute
	token, _, err := issuer.Issue(testPlan([]string{PermissionTaskContext}, now.Add(time.Minute)))
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	issuer.Now = func() time.Time { return now.Add(2 * time.Minute) }
	_, err = Gateway{Issuer: issuer, Store: &memoryStore{}}.CallTool(context.Background(), token, ToolTaskContext, nil)
	if !errors.Is(err, ErrExpiredToken) {
		t.Fatalf("CallTool error = %v, want ErrExpiredToken", err)
	}
}

func TestMissingWikiReadDeniesWikiSearch(t *testing.T) {
	gateway, token := testGateway(t, []string{PermissionTaskContext, PermissionReceiptWrite})
	_, err := gateway.CallTool(
		context.Background(),
		token,
		ToolWikiSearch,
		mustJSON(t, WikiSearchArgs{Query: "launch"}),
	)
	if err == nil || err.Error() != "permission required: wiki:read" {
		t.Fatalf("CallTool error = %v", err)
	}
}

func TestMissingReceiptWriteDeniesReceiptWrite(t *testing.T) {
	gateway, token := testGateway(t, []string{PermissionTaskContext, PermissionWikiRead})
	_, err := gateway.CallTool(
		context.Background(),
		token,
		ToolExecutionReceiptWrite,
		mustJSON(t, ReceiptWriteArgs{Status: "completed", Summary: "Done"}),
	)
	if err == nil || err.Error() != "permission required: execution:receipt_write" {
		t.Fatalf("CallTool error = %v", err)
	}
}

func TestAllowedToolSucceeds(t *testing.T) {
	store := &memoryStore{}
	gateway, token := testGatewayWithStore(t, []string{
		PermissionTaskContext,
		PermissionWikiRead,
		PermissionReceiptWrite,
	}, store)

	taskResult, err := gateway.CallTool(context.Background(), token, ToolTaskContext, nil)
	if err != nil {
		t.Fatalf("task context: %v", err)
	}
	taskContext := taskResult.Payload.(TaskContext)
	if taskContext.TaskID != "task-1" {
		t.Fatalf("task context = %+v", taskContext)
	}

	wikiResult, err := gateway.CallTool(
		context.Background(),
		token,
		ToolWikiSearch,
		mustJSON(t, WikiSearchArgs{Query: "launch", Limit: 1}),
	)
	if err != nil {
		t.Fatalf("wiki search: %v", err)
	}
	hits := wikiResult.Payload.([]WikiHit)
	if len(hits) != 1 || hits[0].Path == "" {
		t.Fatalf("wiki hits = %+v", hits)
	}

	receiptResult, err := gateway.CallTool(
		context.Background(),
		token,
		ToolExecutionReceiptWrite,
		mustJSON(t, ReceiptWriteArgs{Status: "completed", Summary: "Done"}),
	)
	if err != nil {
		t.Fatalf("receipt write: %v", err)
	}
	receipt := receiptResult.Payload.(ReceiptResult)
	if receipt.PlanID != "plan-1" || receipt.Summary != "Done" {
		t.Fatalf("receipt = %+v", receipt)
	}
	if store.lastReceipt.PlanID != "plan-1" {
		t.Fatalf("receipt was not written to store: %+v", store.lastReceipt)
	}
}

func TestCodexConfigOverrides(t *testing.T) {
	overrides := CodexConfigOverrides("/tmp/laf-bridge", []string{"mcp-context"}, []string{"LAF_BRIDGE_MCP_TOKEN"})
	joined := strings.Join(overrides, "\n")
	if !strings.Contains(joined, `mcp_servers.laf-bridge-context.command="/tmp/laf-bridge"`) {
		t.Fatalf("missing command override: %q", joined)
	}
	if !strings.Contains(joined, `mcp_servers.laf-bridge-context.args=["mcp-context"]`) {
		t.Fatalf("missing args override: %q", joined)
	}
	if !strings.Contains(joined, `mcp_servers.laf-bridge-context.env_vars=["LAF_BRIDGE_MCP_TOKEN"]`) {
		t.Fatalf("missing env vars override: %q", joined)
	}
}

func testGateway(t *testing.T, permissions []string) (Gateway, string) {
	t.Helper()
	return testGatewayWithStore(t, permissions, &memoryStore{})
}

func testGatewayWithStore(t *testing.T, permissions []string, store ContextStore) (Gateway, string) {
	t.Helper()
	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)
	issuer := NewTokenIssuer([]byte("test-secret-test-secret-test-secret"))
	issuer.Now = func() time.Time { return now }
	plan := testPlan(permissions, now.Add(time.Hour))
	token, _, err := issuer.Issue(plan)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return Gateway{Issuer: issuer, Store: store}, token
}

func testPlan(permissions []string, expiresAt time.Time) bridge.ExecutionPlan {
	taskID := "task-1"
	projectID := "project-1"
	raw, _ := json.Marshal(permissions)
	return bridge.ExecutionPlan{
		EffectivePermissions: raw,
		ExpiresAt:            expiresAt.Format(time.RFC3339),
		ID:                   "plan-1",
		ProjectID:            &projectID,
		TaskID:               &taskID,
		TeamID:               "team-1",
	}
}

func mustJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return raw
}

type memoryStore struct {
	lastReceipt ReceiptDraft
}

func (s *memoryStore) TaskContext(context.Context, TokenClaims) (TaskContext, error) {
	return TaskContext{ProjectID: "project-1", TaskID: "task-1", Text: "Task context"}, nil
}

func (s *memoryStore) WikiSearch(context.Context, TokenClaims, string, int) ([]WikiHit, error) {
	return []WikiHit{{Path: "team/projects/project-1.md", Excerpt: "Launch decision"}}, nil
}

func (s *memoryStore) WriteReceipt(_ context.Context, claims TokenClaims, draft ReceiptDraft) (ReceiptResult, error) {
	s.lastReceipt = draft
	return ReceiptResult{
		ID:      "receipt-1",
		PlanID:  claims.PlanID,
		Status:  draft.Status,
		Summary: draft.Summary,
	}, nil
}
