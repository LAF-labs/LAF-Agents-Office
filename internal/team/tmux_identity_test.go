package team

import (
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/brokeraddr"
)

// nameWithPortSuffix decides the tmux socket and session names at package
// init based on the broker port. When two LAF-Office instances ran on the same
// machine they used to share "laf-office" and "laf-office-team" and race each other's
// kill-session / new-session / split-window calls, which surfaced as
// "spawn first agent: exit status 1" when the server was torn down
// mid-launch. These tests pin the rule so the isolation can't regress
// silently.

func TestNameWithPortSuffixDefaultPort(t *testing.T) {
	if got := nameWithPortSuffixForPort("laf-office", brokeraddr.DefaultPort); got != "laf-office" {
		t.Fatalf("default port should not suffix: got %q, want %q", got, "laf-office")
	}
	if got := nameWithPortSuffixForPort("laf-office-team", brokeraddr.DefaultPort); got != "laf-office-team" {
		t.Fatalf("default port should not suffix session: got %q, want %q", got, "laf-office-team")
	}
}

func TestNameWithPortSuffixNonDefault(t *testing.T) {
	cases := []struct {
		base string
		port int
		want string
	}{
		{"laf-office", 7899, "laf-office-7899"},
		{"laf-office-team", 7899, "laf-office-team-7899"},
		{"laf-office", 8080, "laf-office-8080"},
	}
	for _, tc := range cases {
		if got := nameWithPortSuffixForPort(tc.base, tc.port); got != tc.want {
			t.Fatalf("port %d base %q: got %q, want %q", tc.port, tc.base, got, tc.want)
		}
	}
}

func TestNameWithPortSuffixInvalidPortFallsBack(t *testing.T) {
	if got := nameWithPortSuffixForPort("laf-office", 0); got != "laf-office" {
		t.Fatalf("zero port should fall back: got %q", got)
	}
	if got := nameWithPortSuffixForPort("laf-office", -1); got != "laf-office" {
		t.Fatalf("negative port should fall back: got %q", got)
	}
}

// TestPackageLevelNamesHonorBaseNames guards against someone inadvertently
// changing the base constants in a way that leaks the port suffix into
// external consumers that hardcode "laf-office-team".
func TestPackageLevelNamesHonorBaseNames(t *testing.T) {
	if baseSessionName != "laf-office-team" {
		t.Fatalf("baseSessionName drifted: got %q", baseSessionName)
	}
	if baseTmuxSocketName != "laf-office" {
		t.Fatalf("baseTmuxSocketName drifted: got %q", baseTmuxSocketName)
	}
}
