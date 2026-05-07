package agent

import (
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/office"
)

func TestCompactionTokenLimitPerSlug(t *testing.T) {
	t.Setenv(compactionTokenLimitEnv, "")

	if got := compactionTokenLimit("eng"); got != defaultTokenLimit {
		t.Errorf("specialist limit: got %d, want %d", got, defaultTokenLimit)
	}
	if got := compactionTokenLimit(office.DefaultLeadAgentSlug); got != leadTokenLimit {
		t.Errorf("lead limit: got %d, want %d", got, leadTokenLimit)
	}

	// Env override wins for both, so operators retain control.
	t.Setenv(compactionTokenLimitEnv, "5000")
	if got := compactionTokenLimit("eng"); got != 5000 {
		t.Errorf("specialist env override: got %d, want 5000", got)
	}
	if got := compactionTokenLimit(office.DefaultLeadAgentSlug); got != 5000 {
		t.Errorf("lead env override: got %d, want 5000", got)
	}
}
