package team

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPostMessagePersistsTaskExecutionMetadata(t *testing.T) {
	b := newTestBroker(t)
	body := map[string]any{
		"from":       "you",
		"channel":    "general",
		"content":    "Run the task",
		"project_id": "orion",
		"task_id":    "task-123",
		"scope":      "task_execution",
		"model_mode": "local_cli",
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/messages", bytes.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+b.token)
	rec := httptest.NewRecorder()

	b.handlePostMessage(rec, req)
	if rec.Code != http.StatusOK {
		resBody, _ := io.ReadAll(rec.Result().Body)
		t.Fatalf("post message status=%d body=%s", rec.Code, string(resBody))
	}

	messages := b.ChannelMessages("general")
	if len(messages) == 0 {
		t.Fatalf("expected message to be persisted")
	}
	msg := messages[len(messages)-1]
	if msg.ProjectID != "orion" || msg.TaskID != "task-123" || msg.Scope != "task_execution" || msg.ModelMode != "local_cli" {
		t.Fatalf("metadata = project:%q task:%q scope:%q mode:%q", msg.ProjectID, msg.TaskID, msg.Scope, msg.ModelMode)
	}
}

func TestModelAvailabilityRequiresSupportedLocalCLI(t *testing.T) {
	b := newTestBroker(t)
	b.mu.Lock()
	b.runners = []hostedRunner{{
		ID:           "runner-1",
		Status:       runnerStatusConnected,
		Capabilities: runnerCapabilities{},
	}}
	b.mu.Unlock()

	req := httptest.NewRequest(http.MethodGet, "/model/availability", nil)
	rec := httptest.NewRecorder()
	b.handleModelAvailability(rec, req)
	if rec.Code != http.StatusOK {
		resBody, _ := io.ReadAll(rec.Result().Body)
		t.Fatalf("availability status=%d body=%s", rec.Code, string(resBody))
	}
	var withoutCLI struct {
		LocalCLI struct {
			Available bool   `json:"available"`
			Reason    string `json:"reason"`
		} `json:"local_cli"`
	}
	if err := json.NewDecoder(rec.Result().Body).Decode(&withoutCLI); err != nil {
		t.Fatalf("decode availability: %v", err)
	}
	if withoutCLI.LocalCLI.Available || withoutCLI.LocalCLI.Reason != "no supported local CLI detected" {
		t.Fatalf("local_cli without runtime = %+v", withoutCLI.LocalCLI)
	}

	b.mu.Lock()
	b.runners[0].Capabilities.ProviderRuntimes = []string{"codex"}
	b.mu.Unlock()
	rec = httptest.NewRecorder()
	b.handleModelAvailability(rec, req)
	var withCLI struct {
		LocalCLI struct {
			Available bool `json:"available"`
		} `json:"local_cli"`
	}
	if err := json.NewDecoder(rec.Result().Body).Decode(&withCLI); err != nil {
		t.Fatalf("decode availability with CLI: %v", err)
	}
	if !withCLI.LocalCLI.Available {
		t.Fatalf("expected local_cli to be available with codex runtime")
	}
}

func TestPostTaskRejectsUnavailableLocalCLIMode(t *testing.T) {
	b := newTestBroker(t)
	body := map[string]any{
		"action":     "create",
		"channel":    "general",
		"created_by": "you",
		"model_mode": "local_cli",
		"title":      "Run locally",
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewReader(raw))
	rec := httptest.NewRecorder()

	b.handlePostTask(rec, req)

	if rec.Code != http.StatusForbidden {
		resBody, _ := io.ReadAll(rec.Result().Body)
		t.Fatalf("post task status=%d body=%s", rec.Code, string(resBody))
	}
	if len(b.tasks) != 0 {
		t.Fatalf("task should not be created when local_cli is unavailable")
	}
}
