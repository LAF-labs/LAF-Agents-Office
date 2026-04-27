package team

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/action"
)

func TestProcessDueWorkflowJobUsesComposioProvider(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("LAF_OFFICE_ACTION_PROVIDER", "composio")
	t.Setenv("LAF_OFFICE_COMPOSIO_API_KEY", "cmp-test-key")
	t.Setenv("LAF_OFFICE_COMPOSIO_USER_ID", "user@example.com")

	mux := http.NewServeMux()
	mux.HandleFunc("/connected_accounts/ca_123", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":      "ca_123",
			"user_id": "cmp_user_123",
			"status":  "ACTIVE",
		})
	})
	mux.HandleFunc("/tools/execute/GMAIL_FETCH_EMAILS", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"messages": []map[string]any{{
					"messageId":        "msg-1",
					"threadId":         "thread-1",
					"messageTimestamp": "2026-03-31T07:30:00Z",
					"subject":          "Digest source email",
					"sender":           "support@example.com",
					"to":               "user@example.com",
					"preview": map[string]any{
						"body": "Important update for the digest.",
					},
					"labelIds": []string{"INBOX"},
				}},
				"resultSizeEstimate": 1,
			},
		})
	})
	mux.HandleFunc("/tools/execute/GMAIL_SEND_EMAIL", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"id": "msg-sent-1",
			},
		})
	})
	server := httptest.NewServer(mux)
	defer server.Close()

	t.Setenv("LAF_OFFICE_DEV_URL", server.URL)
	t.Setenv("LAF_OFFICE_COMPOSIO_BASE_URL", server.URL)

	provider := action.NewComposioFromEnv()
	definition, _ := json.Marshal(map[string]any{
		"version": "laf_office_workflow_v1",
		"inputs": map[string]any{
			"connection_key":  "ca_123",
			"recipient_email": "user@example.com",
			"subject":         "Daily Digest",
		},
		"steps": []map[string]any{
			{
				"id":             "fetch_emails",
				"type":           "action",
				"platform":       "gmail",
				"action_id":      "GMAIL_FETCH_EMAILS",
				"connection_key": "{{ .inputs.connection_key }}",
				"data": map[string]any{
					"query": "newer_than:1d",
				},
			},
			{
				"id":       "compose_digest",
				"type":     "template",
				"template": "Executive Summary\n- Digest generated.\n\nWhy This Matters\n- It keeps the office current.\n\nWhat To Do Next\n- Read the highlights.\n\nEmail Highlights: {{ toJSON .steps.fetch_emails.response.data.messages }}",
			},
			{
				"id":             "send_email",
				"type":           "action",
				"platform":       "gmail",
				"action_id":      "GMAIL_SEND_EMAIL",
				"connection_key": "{{ .inputs.connection_key }}",
				"data": map[string]any{
					"recipient_email": "{{ .inputs.recipient_email }}",
					"subject":         "{{ .inputs.subject }}",
					"body":            "{{ .steps.compose_digest.result }}",
				},
			},
		},
	})
	if _, err := provider.CreateWorkflow(context.Background(), action.WorkflowCreateRequest{
		Key:        "daily-digest",
		Definition: definition,
	}); err != nil {
		t.Fatalf("create workflow: %v", err)
	}

	b := newTestBroker(t)
	b.skills = append(b.skills, teamSkill{
		Name:             "daily-digest",
		Title:            "Daily Digest",
		WorkflowProvider: "composio",
		WorkflowKey:      "daily-digest",
		Status:           "active",
		CreatedAt:        time.Now().UTC().Format(time.RFC3339),
		UpdatedAt:        time.Now().UTC().Format(time.RFC3339),
	})
	payload, _ := json.Marshal(map[string]any{
		"provider":      "composio",
		"workflow_key":  "daily-digest",
		"inputs":        map[string]any{},
		"schedule_expr": "daily",
		"channel":       "general",
		"skill_name":    "daily-digest",
	})
	job := schedulerJob{
		Slug:         "composio-workflow:general:daily-digest",
		Kind:         "composio_workflow",
		Label:        "Run Daily Digest",
		TargetType:   "workflow",
		TargetID:     "daily-digest",
		Channel:      "general",
		Provider:     "composio",
		ScheduleExpr: "daily",
		WorkflowKey:  "daily-digest",
		Status:       "scheduled",
		Payload:      string(payload),
	}
	b.scheduler = append(b.scheduler, job)

	l := &Launcher{broker: b}
	l.processDueWorkflowJob(job)

	actions := b.Actions()
	if len(actions) == 0 {
		t.Fatalf("expected workflow action to be recorded")
	}
	lastAction := actions[len(actions)-1]
	if lastAction.Kind != "external_workflow_executed" || lastAction.Source != "composio" {
		t.Fatalf("unexpected action %+v", lastAction)
	}

	jobs := b.Scheduler()
	if len(jobs) != 1 || jobs[0].Status != "scheduled" || jobs[0].NextRun == "" {
		t.Fatalf("unexpected scheduler state %+v", jobs)
	}
	if b.skills[len(b.skills)-1].LastExecutionStatus != "completed" {
		t.Fatalf("expected skill execution status updated, got %+v", b.skills[len(b.skills)-1])
	}
}
