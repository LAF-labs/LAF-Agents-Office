package team

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlePostTaskRejectsInvalidExecutionMode(t *testing.T) {
	b := newTestBroker(t)
	resp := postTaskValidationJSON(t, b, b.requireAuth(b.handleTasks), "/tasks", map[string]any{
		"action":         "create",
		"channel":        "general",
		"title":          "Implement lifecycle validation",
		"created_by":     "human",
		"execution_mode": "sandbox",
	})

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid execution_mode to return 400, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestHandlePostTaskRejectsInvalidReviewState(t *testing.T) {
	b := newTestBroker(t)
	resp := postTaskValidationJSON(t, b, b.requireAuth(b.handleTasks), "/tasks", map[string]any{
		"action":       "create",
		"channel":      "general",
		"title":        "Implement lifecycle validation",
		"created_by":   "human",
		"review_state": "needs_manager",
	})

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid review_state to return 400, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestHandleTaskPlanRejectsInvalidExecutionMode(t *testing.T) {
	b := newTestBroker(t)
	resp := postTaskValidationJSON(t, b, b.requireAuth(b.handleTaskPlan), "/task-plan", map[string]any{
		"channel":    "general",
		"created_by": "human",
		"tasks": []map[string]any{
			{
				"title":          "Write project plan",
				"assignee":       "planner",
				"execution_mode": "sandbox",
			},
		},
	})

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid execution_mode to return 400, got %d: %s", resp.Code, resp.Body.String())
	}
}

func postTaskValidationJSON(t *testing.T, b *Broker, handler http.HandlerFunc, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+b.Token())
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler(rec, req)
	res := rec.Result()
	_, _ = io.Copy(io.Discard, res.Body)
	_ = res.Body.Close()
	return rec
}
