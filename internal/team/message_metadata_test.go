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

func TestModelAvailabilityOnlyExposesMyBridge(t *testing.T) {
	b := newTestBroker(t)
	req := httptest.NewRequest(http.MethodGet, "/model/availability", nil)
	rec := httptest.NewRecorder()
	b.handleModelAvailability(rec, req)
	if rec.Code != http.StatusOK {
		resBody, _ := io.ReadAll(rec.Result().Body)
		t.Fatalf("availability status=%d body=%s", rec.Code, string(resBody))
	}
	raw, err := io.ReadAll(rec.Result().Body)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("team_bridge")) {
		t.Fatalf("local model availability should not expose team_bridge: %s", raw)
	}
	var withoutCLI struct {
		MyBridge struct {
			Available bool   `json:"available"`
			Reason    string `json:"reason"`
		} `json:"my_bridge"`
	}
	if err := json.Unmarshal(raw, &withoutCLI); err != nil {
		t.Fatalf("decode availability: %v", err)
	}
	if withoutCLI.MyBridge.Available || withoutCLI.MyBridge.Reason != "no paired LAF Bridge detected" {
		t.Fatalf("my_bridge without pairing = %+v", withoutCLI.MyBridge)
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
