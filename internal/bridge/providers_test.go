package bridge

import (
	"context"
	"errors"
	"testing"
)

func TestDetectCapabilitiesFindsCodex(t *testing.T) {
	caps := DetectCapabilities(context.Background(), ProviderDetector{
		LookPath: func(file string) (string, error) {
			switch file {
			case "codex":
				return "/usr/local/bin/codex", nil
			case "claude":
				return "", errors.New("not found")
			default:
				t.Fatalf("unexpected lookup %q", file)
			}
			return "", errors.New("not found")
		},
		Version: func(context.Context, string) (string, error) {
			return "codex 1.2.3", nil
		},
	})
	if len(caps.ProviderRuntimes) != 1 || caps.ProviderRuntimes[0] != "codex" {
		t.Fatalf("provider runtimes: %#v", caps.ProviderRuntimes)
	}
	if !caps.CLIDetails["codex"].Detected {
		t.Fatalf("codex should be detected: %#v", caps.CLIDetails["codex"])
	}
	if caps.CLIDetails["codex"].Version != "codex 1.2.3" {
		t.Fatalf("version mismatch: %#v", caps.CLIDetails["codex"])
	}
	if caps.CLIDetails["claude-code"].Detected {
		t.Fatalf("claude should not be detected: %#v", caps.CLIDetails["claude-code"])
	}
}

func TestDetectCapabilitiesFindsClaudeCode(t *testing.T) {
	caps := DetectCapabilities(context.Background(), ProviderDetector{
		LookPath: func(file string) (string, error) {
			switch file {
			case "codex":
				return "", errors.New("not found")
			case "claude":
				return "/usr/local/bin/claude", nil
			default:
				t.Fatalf("unexpected lookup %q", file)
			}
			return "", errors.New("not found")
		},
		Version: func(_ context.Context, path string) (string, error) {
			if path != "/usr/local/bin/claude" {
				t.Fatalf("unexpected version path %q", path)
			}
			return "claude 2.0.0", nil
		},
	})
	if len(caps.ProviderRuntimes) != 1 || caps.ProviderRuntimes[0] != "claude-code" {
		t.Fatalf("provider runtimes: %#v", caps.ProviderRuntimes)
	}
	if caps.CLIDetails["codex"].Detected {
		t.Fatalf("codex should not be detected: %#v", caps.CLIDetails["codex"])
	}
	if !caps.CLIDetails["claude-code"].Detected {
		t.Fatalf("claude should be detected: %#v", caps.CLIDetails["claude-code"])
	}
	if caps.CLIDetails["claude-code"].Version != "claude 2.0.0" {
		t.Fatalf("version mismatch: %#v", caps.CLIDetails["claude-code"])
	}
}

func TestDetectCapabilitiesReportsMissingCodex(t *testing.T) {
	caps := DetectCapabilities(context.Background(), ProviderDetector{
		LookPath: func(string) (string, error) {
			return "", errors.New("not found")
		},
	})
	if len(caps.ProviderRuntimes) != 0 {
		t.Fatalf("provider runtimes: %#v", caps.ProviderRuntimes)
	}
	if caps.CLIDetails["codex"].Detected {
		t.Fatalf("codex should not be detected: %#v", caps.CLIDetails["codex"])
	}
	if caps.CLIDetails["claude-code"].Detected {
		t.Fatalf("claude should not be detected: %#v", caps.CLIDetails["claude-code"])
	}
}
