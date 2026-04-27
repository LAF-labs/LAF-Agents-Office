package team

import (
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
)

func TestResolveMemoryBackendStatusDefaultsToMarkdown(t *testing.T) {
	t.Setenv("LAF_OFFICE_MEMORY_BACKEND", "")

	status := ResolveMemoryBackendStatus()
	if status.SelectedKind != config.MemoryBackendMarkdown {
		t.Fatalf("expected selected backend markdown, got %+v", status)
	}
	if status.ActiveKind != config.MemoryBackendMarkdown {
		t.Fatalf("expected active backend markdown, got %+v", status)
	}
}

func TestResolveMemoryBackendStatusGBrainEnvFallsBackToMarkdown(t *testing.T) {
	t.Setenv("LAF_OFFICE_MEMORY_BACKEND", config.MemoryBackendGBrain)
	t.Setenv("LAF_OFFICE_OPENAI_API_KEY", "sk-test-openai")

	status := ResolveMemoryBackendStatus()
	if status.SelectedKind != config.MemoryBackendMarkdown || status.ActiveKind != config.MemoryBackendMarkdown {
		t.Fatalf("expected deprecated gbrain setting to fall back to markdown, got %+v", status)
	}
}

func TestInferSharedMemoryOwnerFromGBrainSlug(t *testing.T) {
	owner := inferSharedMemoryOwner("laf-office-shared--pm--launch-brief--20260416-120000", "")
	if owner != "pm" {
		t.Fatalf("expected owner pm from gbrain slug, got %q", owner)
	}
}
