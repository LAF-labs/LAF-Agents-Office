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
	if path, err := detector.LookPath("codex"); err == nil && strings.TrimSpace(path) != "" {
		detail := CLIDetails{Detected: true, Path: path}
		if version, err := detector.Version(ctx, path); err == nil {
			detail.Version = strings.TrimSpace(version)
		} else if err != nil {
			detail.Error = err.Error()
		}
		details["codex"] = detail
		runtimes = append(runtimes, "codex")
	} else {
		details["codex"] = CLIDetails{Detected: false, Error: "codex not found on PATH"}
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
