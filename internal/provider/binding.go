package provider

import "fmt"

// Kind values for ProviderBinding.Kind. The empty string means "fall back to
// the install-wide default" (config.ResolveLLMProvider at dispatch time), which
// keeps manifests written before per-agent providers existed loading unchanged.
const (
	KindClaudeCode = "claude-code"
	KindCodex      = "codex"
	KindOpencode   = "opencode"
)

// ProviderBinding is the per-agent runtime selection persisted on an office
// member and on company.MemberSpec. It captures which LLM runtime executes the
// agent's turns (Kind) and which model the runtime should use (Model, free
// form — validated by the runtime itself, not here).
type ProviderBinding struct {
	Kind  string `json:"kind,omitempty"`
	Model string `json:"model,omitempty"`
}

// AgentModelDefaults stores the team-wide default model choice for an agent
// across every execution surface the product exposes. Runtime dispatch still
// picks the active surface separately; this struct only answers "which model
// should this agent use when that surface is selected?"
type AgentModelDefaults struct {
	Claude string `json:"claude,omitempty"`
	Codex  string `json:"codex,omitempty"`
	LAF    string `json:"laf,omitempty"`
}

// ValidateKind reports whether s is an acceptable ProviderBinding.Kind value.
// The empty string is valid and means "use install-wide default."
func ValidateKind(s string) error {
	switch s {
	case "", KindClaudeCode, KindCodex, KindOpencode:
		return nil
	default:
		return fmt.Errorf("unknown provider kind %q (valid: %s, %s, %s, or empty)",
			s, KindClaudeCode, KindCodex, KindOpencode)
	}
}

// ResolveKind returns the effective runtime kind for a binding. If the
// binding's Kind is empty, it falls back to global() — the caller provides
// this function so this package stays decoupled from config loading.
func ResolveKind(b ProviderBinding, global func() string) string {
	if b.Kind != "" {
		return b.Kind
	}
	if global == nil {
		return ""
	}
	return global()
}
