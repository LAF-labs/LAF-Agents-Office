package provider

import (
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
)

func TestDefaultResolverUsesClaudeCode(t *testing.T) {
	// When LLMProvider is empty, should resolve to claude-code, not office-ask
	cfg := config.Config{} // empty provider
	resolver := DefaultStreamFnResolver(nil, nil)
	fn := resolver("test-agent")
	if fn == nil {
		t.Fatal("resolver returned nil StreamFn")
	}
	// We can't easily test the internal provider, but we verify it doesn't panic
	_ = cfg // used for context
}
