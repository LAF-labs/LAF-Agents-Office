package office

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestChannelMessageJSONShape(t *testing.T) {
	msg := ChannelMessage{
		ID:        "msg-1",
		From:      "ceo",
		Channel:   "general",
		Content:   "Ship it",
		Tagged:    []string{"eng"},
		Timestamp: "2026-04-27T00:00:00Z",
		Usage:     &MessageUsage{TotalTokens: 42},
		Reactions: []MessageReaction{{Emoji: "+1", From: "you"}},
	}

	raw, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal message: %v", err)
	}
	encoded := string(raw)
	for _, want := range []string{
		`"channel":"general"`,
		`"total_tokens":42`,
		`"reactions":[{"emoji":"+1","from":"you"}]`,
	} {
		if !strings.Contains(encoded, want) {
			t.Fatalf("expected JSON to contain %s, got %s", want, encoded)
		}
	}
}

func TestTeamTaskJSONShape(t *testing.T) {
	task := TeamTask{
		ID:            "task-1",
		Title:         "Fix workflow",
		Status:        "in_progress",
		CreatedBy:     "ceo",
		ExecutionMode: "local_worktree",
		DependsOn:     []string{"task-0"},
		CreatedAt:     "2026-04-27T00:00:00Z",
		UpdatedAt:     "2026-04-27T00:01:00Z",
	}

	raw, err := json.Marshal(task)
	if err != nil {
		t.Fatalf("marshal task: %v", err)
	}
	encoded := string(raw)
	for _, want := range []string{
		`"execution_mode":"local_worktree"`,
		`"depends_on":["task-0"]`,
	} {
		if !strings.Contains(encoded, want) {
			t.Fatalf("expected JSON to contain %s, got %s", want, encoded)
		}
	}
}

func TestTaskStatusHelpers(t *testing.T) {
	if !IsTerminalTaskStatus(" completed ") {
		t.Fatalf("completed should be terminal")
	}
	if IsTerminalTaskStatus(string(TaskStatusInProgress)) {
		t.Fatalf("in_progress should not be terminal")
	}
	if !IsLocalWorktreeExecutionMode("LOCAL_WORKTREE") {
		t.Fatalf("local worktree check should be case-insensitive")
	}
}
