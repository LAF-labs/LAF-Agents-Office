package team

import (
	"testing"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/agent"
)

func TestNotificationTargetsSuppressCollaborativeStatusOnlyChatter(t *testing.T) {
	l := &Launcher{
		pack: &agent.PackDefinition{
			LeadSlug: "ceo",
			Agents: []agent.AgentConfig{
				{Slug: "ceo", Name: "CEO"},
				{Slug: "fe", Name: "Frontend Engineer"},
			},
		},
	}

	immediate, delayed := l.notificationTargetsForMessage(channelMessage{
		From:    "fe",
		Channel: "general",
		Content: "[STATUS] still running tests",
	})

	if len(immediate) != 0 || len(delayed) != 0 {
		t.Fatalf("expected status-only specialist update to stay quiet, got immediate=%+v delayed=%+v", immediate, delayed)
	}
}

func TestNotificationTargetsSuppressExactDuplicateSpecialistUpdate(t *testing.T) {
	b := newTestBroker(t)
	now := time.Now().UTC()
	b.mu.Lock()
	b.members = []officeMember{
		{Slug: "ceo", Name: "CEO", Role: "lead"},
		{Slug: "fe", Name: "Frontend Engineer", Role: "specialist"},
	}
	for i := range b.channels {
		if b.channels[i].Slug == "general" {
			b.channels[i].Members = []string{"ceo", "fe"}
		}
	}
	b.messages = append(b.messages, channelMessage{
		ID:        "msg-prev",
		From:      "fe",
		Channel:   "general",
		Content:   "Review build finished.",
		Timestamp: now.Add(-30 * time.Second).Format(time.RFC3339),
	})
	b.mu.Unlock()

	l := &Launcher{
		broker: b,
		pack: &agent.PackDefinition{
			LeadSlug: "ceo",
			Agents: []agent.AgentConfig{
				{Slug: "ceo", Name: "CEO"},
				{Slug: "fe", Name: "Frontend Engineer"},
			},
		},
	}

	immediate, delayed := l.notificationTargetsForMessage(channelMessage{
		ID:        "msg-current",
		From:      "fe",
		Channel:   "general",
		Content:   "Review build finished.",
		Timestamp: now.Format(time.RFC3339),
	})
	if len(immediate) != 0 || len(delayed) != 0 {
		t.Fatalf("expected duplicate specialist update to stay quiet, got immediate=%+v delayed=%+v", immediate, delayed)
	}
	b.mu.Lock()
	if got := b.usage.Optimization.WakeSuppressions["exact_duplicate"]; got != 1 {
		b.mu.Unlock()
		t.Fatalf("exact_duplicate suppression count = %d, want 1", got)
	}
	b.mu.Unlock()

	immediate, _ = l.notificationTargetsForMessage(channelMessage{
		ID:        "msg-explicit",
		From:      "fe",
		Channel:   "general",
		Content:   "Review build finished.",
		Tagged:    []string{"ceo"},
		Timestamp: now.Format(time.RFC3339),
	})
	if !containsNotificationTarget(immediate, "ceo") {
		t.Fatalf("explicit @ceo duplicate should still wake lead, got %+v", immediate)
	}
	b.mu.Lock()
	if got := b.usage.Optimization.WakeReasons["explicit_tag"]; got != 1 {
		b.mu.Unlock()
		t.Fatalf("explicit_tag wake count = %d, want 1", got)
	}
	b.mu.Unlock()
}
