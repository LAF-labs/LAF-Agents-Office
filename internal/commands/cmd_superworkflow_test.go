package commands

import (
	"strings"
	"testing"
)

func TestSuperworkflowCommandsAreDispatchable(t *testing.T) {
	tests := map[string]string{
		"/hire-agent":        "Claude-powered or Codex-powered",
		"/assign-task":       "/task create",
		"/daily-standup":     "Durable lessons go to Notebooks",
		"/review-office":     "laf-superworkflow-check.sh reviewer",
		"/promote-to-wiki":   "Never auto-promote",
		"/fix-bug":           "smallest failing test",
		"/deploy-simulation": "--provider claude-code",
	}

	for input, want := range tests {
		t.Run(input, func(t *testing.T) {
			got := Dispatch(input, "", "text", 0)
			if got.ExitCode != 0 {
				t.Fatalf("Dispatch(%q) exit=%d err=%s", input, got.ExitCode, got.Error)
			}
			if !strings.Contains(got.Output, want) {
				t.Fatalf("Dispatch(%q) missing %q in:\n%s", input, want, got.Output)
			}
		})
	}
}
