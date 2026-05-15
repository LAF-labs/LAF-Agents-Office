package providers

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
	"github.com/LAF-labs/LAF-Agents-Office/internal/provider"
)

type CodexExec struct {
	Path           string
	Model          string
	LookPath       func(file string) (string, error)
	CommandContext func(ctx context.Context, name string, args ...string) *exec.Cmd
}

type CodexDetection struct {
	Detected bool   `json:"detected"`
	Path     string `json:"path,omitempty"`
	Version  string `json:"version,omitempty"`
	Error    string `json:"error,omitempty"`
}

type CodexExecResult = bridge.ExecutionOutcome

func (c CodexExec) Detect(ctx context.Context) CodexDetection {
	path, err := c.resolvePath()
	if err != nil {
		return CodexDetection{Detected: false, Error: err.Error()}
	}
	runCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	cmd := c.command(runCtx, path, "--version")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return CodexDetection{Detected: false, Path: path, Error: strings.TrimSpace(err.Error() + ": " + string(out))}
	}
	return CodexDetection{Detected: true, Path: path, Version: strings.TrimSpace(string(out))}
}

func (c CodexExec) Execute(ctx context.Context, plan bridge.ExecutionPlan, binding bridge.ProjectBinding) (bridge.ExecutionOutcome, error) {
	if strings.TrimSpace(binding.LocalPath) == "" {
		return bridge.ExecutionOutcome{}, fmt.Errorf("codex execution requires a trusted local binding path")
	}
	return c.Run(ctx, binding.LocalPath, plan.Prompt)
}

func (c CodexExec) Run(ctx context.Context, workdir string, prompt string) (CodexExecResult, error) {
	path, err := c.resolvePath()
	if err != nil {
		return CodexExecResult{}, err
	}
	args := c.args(workdir)
	cmd := c.command(ctx, path, args...)
	cmd.Dir = workdir
	cmd.Stdin = strings.NewReader(prompt)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return CodexExecResult{}, fmt.Errorf("attach codex stdout: %w", err)
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return CodexExecResult{}, err
	}

	var events []bridge.ProviderEvent
	streamResult, parseErr := provider.ReadCodexJSONStream(stdout, func(event provider.CodexStreamEvent) {
		events = append(events, normalizeCodexEvent(event))
	})
	waitErr := cmd.Wait()
	if parseErr != nil {
		return CodexExecResult{}, parseErr
	}
	if waitErr != nil {
		detail := strings.TrimSpace(firstNonEmpty(streamResult.LastError, stderr.String(), waitErr.Error()))
		if ctx.Err() != nil {
			detail = ctx.Err().Error()
		}
		return CodexExecResult{}, fmt.Errorf("codex exec failed: %s", bridge.RedactText(detail))
	}
	changedFiles, err := bridge.CaptureChangedFiles(ctx, workdir)
	if err != nil {
		return CodexExecResult{}, fmt.Errorf("capture changed files: %w", err)
	}
	return CodexExecResult{
		Status:       "completed",
		Summary:      bridge.RedactText(strings.TrimSpace(streamResult.FinalMessage)),
		Events:       events,
		ChangedFiles: changedFiles,
		Usage: map[string]int{
			"input_tokens":          streamResult.Usage.InputTokens,
			"output_tokens":         streamResult.Usage.OutputTokens,
			"cache_read_tokens":     streamResult.Usage.CacheReadTokens,
			"cache_creation_tokens": streamResult.Usage.CacheCreationTokens,
		},
	}, nil
}

func (c CodexExec) resolvePath() (string, error) {
	if strings.TrimSpace(c.Path) != "" {
		return strings.TrimSpace(c.Path), nil
	}
	lookPath := c.LookPath
	if lookPath == nil {
		lookPath = exec.LookPath
	}
	return lookPath("codex")
}

func (c CodexExec) args(workdir string) []string {
	args := []string{"exec"}
	if strings.TrimSpace(c.Model) != "" {
		args = append(args, "--model", strings.TrimSpace(c.Model))
	}
	args = append(args,
		"-C", workdir,
		"--skip-git-repo-check",
		"--ephemeral",
		"--color", "never",
		"--json",
		"--sandbox", "workspace-write",
		"-",
	)
	return args
}

func (c CodexExec) command(ctx context.Context, name string, args ...string) *exec.Cmd {
	if c.CommandContext != nil {
		return c.CommandContext(ctx, name, args...)
	}
	return exec.CommandContext(ctx, name, args...)
}

func normalizeCodexEvent(event provider.CodexStreamEvent) bridge.ProviderEvent {
	payload := map[string]any{
		"raw_type": event.RawType,
	}
	if strings.TrimSpace(event.Text) != "" {
		payload["text"] = event.Text
	}
	if strings.TrimSpace(event.ToolName) != "" {
		payload["tool_name"] = event.ToolName
	}
	if strings.TrimSpace(event.ToolInput) != "" {
		payload["tool_input"] = event.ToolInput
	}
	if strings.TrimSpace(event.ToolUseID) != "" {
		payload["tool_use_id"] = event.ToolUseID
	}
	if strings.TrimSpace(event.Detail) != "" {
		payload["detail"] = event.Detail
	}
	return bridge.ProviderEvent{
		Type:    "codex." + strings.TrimSpace(event.Type),
		Payload: bridge.RedactValue(payload).(map[string]any),
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
