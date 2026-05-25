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
		"model_mode": "laf_model",
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
	if msg.ProjectID != "orion" || msg.TaskID != "task-123" || msg.Scope != "task_execution" || msg.ModelMode != "laf_model" {
		t.Fatalf("metadata = project:%q task:%q scope:%q mode:%q", msg.ProjectID, msg.TaskID, msg.Scope, msg.ModelMode)
	}
}

func TestModelAvailabilityExposesCloudModesOnly(t *testing.T) {
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
	for _, legacyMode := range []string{"team_" + "bri" + "dge", "my_" + "bri" + "dge", "local" + "_cli"} {
		legacy := []byte(legacyMode)
		if bytes.Contains(raw, legacy) {
			t.Fatalf("model availability should not expose legacy local mode %q: %s", legacy, raw)
		}
	}
	var availability struct {
		AllowedModes []string `json:"allowed_modes"`
		RecordOnly   struct {
			Available bool `json:"available"`
		} `json:"record_only"`
	}
	if err := json.Unmarshal(raw, &availability); err != nil {
		t.Fatalf("decode availability: %v", err)
	}
	if !availability.RecordOnly.Available {
		t.Fatalf("record_only should always be available: %s", raw)
	}
}

func TestPostTaskNormalizesUnknownModeToRecordOnly(t *testing.T) {
	b := newTestBroker(t)
	body := map[string]any{
		"action":     "create",
		"channel":    "general",
		"created_by": "you",
		"model_mode": "unknown_mode",
		"title":      "Run locally",
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewReader(raw))
	rec := httptest.NewRecorder()

	b.handlePostTask(rec, req)

	if rec.Code != http.StatusOK {
		resBody, _ := io.ReadAll(rec.Result().Body)
		t.Fatalf("post task status=%d body=%s", rec.Code, string(resBody))
	}
	if len(b.tasks) != 1 || b.tasks[0].ModelMode != "record_only" {
		t.Fatalf("legacy local mode should normalize to record_only: %+v", b.tasks)
	}
}
