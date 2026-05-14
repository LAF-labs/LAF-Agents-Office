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
		"model_mode": "my_bridge",
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
	if msg.ProjectID != "orion" || msg.TaskID != "task-123" || msg.Scope != "task_execution" || msg.ModelMode != "my_bridge" {
		t.Fatalf("metadata = project:%q task:%q scope:%q mode:%q", msg.ProjectID, msg.TaskID, msg.Scope, msg.ModelMode)
	}
}

func TestModelAvailabilityRequiresSupportedTeamBridgeCLI(t *testing.T) {
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
		MyBridge struct {
			Available bool   `json:"available"`
			Reason    string `json:"reason"`
		} `json:"my_bridge"`
		TeamBridge struct {
			Available bool   `json:"available"`
			Reason    string `json:"reason"`
		} `json:"team_bridge"`
	}
	if err := json.NewDecoder(rec.Result().Body).Decode(&withoutCLI); err != nil {
		t.Fatalf("decode availability: %v", err)
	}
	if withoutCLI.MyBridge.Available || withoutCLI.MyBridge.Reason != "no paired desktop bridge detected" {
		t.Fatalf("my_bridge without pairing = %+v", withoutCLI.MyBridge)
	}
	if withoutCLI.TeamBridge.Available || withoutCLI.TeamBridge.Reason != "no supported local CLI detected" {
		t.Fatalf("team_bridge without runtime = %+v", withoutCLI.TeamBridge)
	}

	b.mu.Lock()
	b.runners[0].Capabilities.ProviderRuntimes = []string{"codex"}
	b.mu.Unlock()
	rec = httptest.NewRecorder()
	b.handleModelAvailability(rec, req)
	var withCLI struct {
		TeamBridge struct {
			Available bool `json:"available"`
		} `json:"team_bridge"`
	}
	if err := json.NewDecoder(rec.Result().Body).Decode(&withCLI); err != nil {
		t.Fatalf("decode availability with CLI: %v", err)
	}
	if !withCLI.TeamBridge.Available {
		t.Fatalf("expected team_bridge to be available with codex runtime")
	}
}

func TestPostTaskRejectsUnavailableMyBridgeMode(t *testing.T) {
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
		t.Fatalf("task should not be created when my_bridge is unavailable")
	}
}
