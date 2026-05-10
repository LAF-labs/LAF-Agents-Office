package provider

import (
	"fmt"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
)

// RunConfiguredOneShot runs a single-shot generation using the active LLM
// provider's OneShot implementation. Providers without a one-shot path
// (Capabilities.SupportsOneShot == false) and unregistered kinds fall back
// to Claude.
func RunConfiguredOneShot(systemPrompt, prompt, cwd string) (string, error) {
	kind := config.ResolveLLMProvider("")
	return RunOneShot(kind, systemPrompt, prompt, cwd)
}

// RunOneShot runs a single-shot generation using the requested provider kind.
// An empty kind keeps the install-wide configured provider behavior.
func RunOneShot(kind, systemPrompt, prompt, cwd string) (string, error) {
	kind = strings.TrimSpace(kind)
	if kind == "" {
		kind = config.ResolveLLMProvider("")
	}
	if e := Lookup(kind); e != nil && e.Capabilities.SupportsOneShot && e.OneShot != nil {
		return e.OneShot(systemPrompt, prompt, cwd)
	}
	if strings.TrimSpace(kind) != "" && kind != config.ResolveLLMProvider("") {
		return "", fmt.Errorf("provider %q does not support one-shot runner execution", kind)
	}
	return RunClaudeOneShot(systemPrompt, prompt, cwd)
}
