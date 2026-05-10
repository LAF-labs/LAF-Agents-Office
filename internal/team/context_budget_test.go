package team

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/agent"
)

func TestBuildPromptRecordsContextBudgetDiagnostics(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	b := newTestBroker(t)
	l := &Launcher{
		broker: b,
		pack: &agent.PackDefinition{
			LeadSlug: "ceo",
			Agents: []agent.AgentConfig{
				{Slug: "ceo", Name: "CEO"},
				{Slug: "eng", Name: "Engineer", Expertise: []string{"backend", "golang"}},
			},
		},
	}

	leadPrompt := l.buildPrompt("ceo")
	specialistPrompt := l.buildPrompt("eng")
	if len([]rune(leadPrompt)) > 25000 {
		t.Fatalf("lead prompt grew past budget: %d chars", len([]rune(leadPrompt)))
	}
	if len([]rune(specialistPrompt)) > 21000 {
		t.Fatalf("specialist prompt grew past budget: %d chars", len([]rune(specialistPrompt)))
	}

	b.mu.Lock()
	opt := b.usage.Optimization
	b.mu.Unlock()
	if opt.PromptBuilds != 2 {
		t.Fatalf("prompt builds = %d, want 2", opt.PromptBuilds)
	}
	if opt.MaxPromptChars == 0 || len(opt.LastPromptSections) == 0 {
		t.Fatalf("missing prompt diagnostics: %+v", opt)
	}
	ids := make([]string, 0, len(opt.LastPromptSections))
	for _, section := range opt.LastPromptSections {
		ids = append(ids, section.ID)
	}
	for _, want := range []string{"team-channel", "tool-hygiene", "your-role-as-specialist"} {
		if !slices.Contains(ids, want) {
			t.Fatalf("prompt sections missing %q: %v", want, ids)
		}
	}
}

func TestProjectMemorySignalScoringKeepsTaskRelevantItems(t *testing.T) {
	markdown := `# Project

## Decisions

- Use the generic launch checklist for marketing copy.
- Keep dashboard cards compact.
- Prefer runner lease renewal checks before creating new runner jobs.
- Store screenshots in receipts.
- Use dark mode tokens for admin chrome.
- Keep hosted auth membership checks strict.
- Runner completion owns delivery receipt updates.
- Archive stale brainstorm notes monthly.
`
	task := teamTask{
		Title:         "Fix runner lease renewal and delivery receipt flow",
		Details:       "The task is blocked until runner jobs renew safely.",
		TaskType:      "feature",
		ExecutionMode: executionModeLocalWorktree,
	}

	signals := extractProjectMemorySignalsForTask("team/projects/p.md", markdown, task)
	if len(signals.Decisions) != 6 {
		t.Fatalf("decisions = %d, want 6: %+v", len(signals.Decisions), signals.Decisions)
	}
	if signals.OmittedDecisions != 2 {
		t.Fatalf("omitted decisions = %d, want 2", signals.OmittedDecisions)
	}
	joined := strings.Join([]string{
		signals.Decisions[0].Text,
		signals.Decisions[1].Text,
		signals.Decisions[2].Text,
		signals.Decisions[3].Text,
		signals.Decisions[4].Text,
		signals.Decisions[5].Text,
	}, "\n")
	for _, want := range []string{"generic launch checklist", "runner lease renewal", "Runner completion owns delivery receipt"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("scored decisions dropped %q:\n%s", want, joined)
		}
	}
}

func TestRecentProjectWorkScoringKeepsHighSignalWork(t *testing.T) {
	current := teamTask{ID: "task-current", Title: "Ship runner delivery flow", Owner: "builder", TaskType: "feature"}
	tasks := []teamTask{
		{
			ID:        "task-low-signal",
			ProjectID: "p",
			Title:     "Minor copy edit",
			Status:    "open",
			UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		},
		{
			ID:              "task-latest-delivered",
			ProjectID:       "p",
			Title:           "Unrelated latest handoff",
			Status:          taskStatusDone,
			DeliverySummary: "Latest meaningful project receipt.",
			UpdatedAt:       time.Now().UTC().Add(-1 * time.Minute).Format(time.RFC3339),
		},
		{
			ID:        "task-blocked",
			ProjectID: "p",
			Title:     "Runner lease repair",
			Status:    taskStatusBlocked,
			Details:   "Blocked on runner token refresh.",
			Blocked:   true,
			UpdatedAt: "2026-05-01T09:00:00Z",
		},
		{
			ID:          "task-review",
			ProjectID:   "p",
			Title:       "Runner UI review",
			Status:      taskStatusReview,
			DeliveryURL: "https://github.com/laf-labs/laf/pull/7",
			UpdatedAt:   "2026-05-01T08:00:00Z",
		},
		{
			ID:              "task-delivered",
			ProjectID:       "p",
			Title:           "Delivery receipt storage",
			Status:          taskStatusDone,
			DeliverySummary: "Receipt updates now include runner delivery state.",
			UpdatedAt:       "2026-05-01T07:00:00Z",
		},
	}

	receipts, omitted := buildRecentProjectWorkReceiptsForTask(tasks, current, 3)
	if omitted != 1 {
		t.Fatalf("omitted = %d, want 1", omitted)
	}
	got := []string{receipts[0].TaskID, receipts[1].TaskID, receipts[2].TaskID}
	if !slices.Contains(got, "task-blocked") || !slices.Contains(got, "task-review") || !slices.Contains(got, "task-latest-delivered") {
		t.Fatalf("recent work should preserve blocked/review/latest meaningful slots, got %v", got)
	}
}

func TestAgentToolEventRecordsBroadReadDiagnostics(t *testing.T) {
	b := newTestBroker(t)
	post := func(tool, args string) {
		t.Helper()
		body, _ := json.Marshal(map[string]string{
			"slug":  "ceo",
			"phase": "call",
			"tool":  tool,
			"args":  args,
		})
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/agent-tool-event", bytes.NewReader(body))
		b.handleAgentToolEvent(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("agent tool event status = %d: %s", rec.Code, rec.Body.String())
		}
	}

	post("team_poll", `{"channel":"general"}`)
	post("team_tasks", `{"channel":"general","reason":"checking existing owner before fallback task"}`)

	b.mu.Lock()
	opt := b.usage.Optimization
	b.mu.Unlock()
	if opt.ToolCalls != 2 {
		t.Fatalf("tool calls = %d, want 2", opt.ToolCalls)
	}
	if opt.BroadPollReads != 1 {
		t.Fatalf("broad poll reads = %d, want 1", opt.BroadPollReads)
	}
	if opt.BroadTaskReads != 0 {
		t.Fatalf("broad task reads = %d, want 0 when reason is supplied", opt.BroadTaskReads)
	}
}
