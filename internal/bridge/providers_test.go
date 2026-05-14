package bridge

import (
	"context"
	"errors"
	"testing"
)

func TestDetectCapabilitiesFindsCodex(t *testing.T) {
	caps := DetectCapabilities(context.Background(), ProviderDetector{
		LookPath: func(file string) (string, error) {
			if file != "codex" {
				t.Fatalf("unexpected lookup %q", file)
			}
			return "/usr/local/bin/codex", nil
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
}
