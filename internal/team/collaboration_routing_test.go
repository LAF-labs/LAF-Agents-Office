package team

import (
	"testing"

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
