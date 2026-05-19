package bridge

import (
	"context"
	"errors"
	"os/exec"
	"strings"
	"time"
)

type Capabilities struct {
	ProviderRuntimes []string              `json:"provider_runtimes"`
	CLIDetails       map[string]CLIDetails `json:"cli_details,omitempty"`
}

type CLIDetails struct {
	Detected bool   `json:"detected"`
	Path     string `json:"path,omitempty"`
	Version  string `json:"version,omitempty"`
	Error    string `json:"error,omitempty"`
}

type ProviderDetector struct {
	LookPath func(file string) (string, error)
	Version  func(ctx context.Context, path string) (string, error)
}

func DetectCapabilities(ctx context.Context, detector ProviderDetector) Capabilities {
	if detector.LookPath == nil {
		detector.LookPath = exec.LookPath
	}
	if detector.Version == nil {
		detector.Version = commandVersion
	}
	details := map[string]CLIDetails{}
	runtimes := []string{}
	for _, cli := range []struct {
		binary  string
		runtime string
	}{
		{binary: "codex", runtime: "codex"},
		{binary: "claude", runtime: "claude-code"},
	} {
		path, err := detector.LookPath(cli.binary)
		if err != nil || strings.TrimSpace(path) == "" {
			details[cli.runtime] = CLIDetails{Detected: false, Error: cli.binary + " not found on PATH"}
			continue
		}
		detail := CLIDetails{Detected: true, Path: path}
		if version, err := detector.Version(ctx, path); err == nil {
			detail.Version = strings.TrimSpace(version)
		} else if err != nil {
			detail.Error = err.Error()
		}
		details[cli.runtime] = detail
		runtimes = append(runtimes, cli.runtime)
	}
	return Capabilities{ProviderRuntimes: runtimes, CLIDetails: details}
}

func commandVersion(ctx context.Context, path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("provider path is empty")
	}
	runCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(runCtx, path, "--version").CombinedOutput()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
