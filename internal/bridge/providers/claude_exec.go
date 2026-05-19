package providers

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
	"github.com/LAF-labs/LAF-Agents-Office/internal/provider"
)

type ClaudeExec struct {
	Path           string
	Model          string
	Env            map[string]string
	LookPath       func(file string) (string, error)
	CommandContext func(ctx context.Context, name string, args ...string) *exec.Cmd
}

func (c ClaudeExec) Execute(ctx context.Context, plan bridge.ExecutionPlan) (bridge.ExecutionOutcome, error) {
	workdir, err := bridge.WorkdirForPlan(ctx, plan)
	if err != nil {
		return bridge.ExecutionOutcome{}, err
	}
	return c.Run(ctx, workdir, plan.Prompt)
}

func (c ClaudeExec) Run(ctx context.Context, workdir string, prompt string) (bridge.ExecutionOutcome, error) {
	path, err := c.resolvePath()
	if err != nil {
		return bridge.ExecutionOutcome{}, err
	}
	args := c.args()
	cmd := c.command(ctx, path, args...)
	cmd.Dir = workdir
	cmd.Stdin = strings.NewReader(prompt)
	if len(c.Env) > 0 {
		if len(cmd.Env) == 0 {
			cmd.Env = os.Environ()
		}
		for key, value := range c.Env {
			if strings.TrimSpace(key) != "" {
				cmd.Env = append(cmd.Env, strings.TrimSpace(key)+"="+value)
			}
		}
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return bridge.ExecutionOutcome{}, fmt.Errorf("attach claude stdout: %w", err)
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return bridge.ExecutionOutcome{}, err
	}

	var events []bridge.ProviderEvent
	streamResult, parseErr := provider.ReadClaudeJSONStream(stdout, func(event provider.ClaudeStreamEvent) {
		events = append(events, normalizeClaudeEvent(event))
	})
	waitErr := cmd.Wait()
	if parseErr != nil {
		return bridge.ExecutionOutcome{}, parseErr
	}
	if waitErr != nil {
		detail := strings.TrimSpace(firstNonEmpty(streamResult.LastError, stderr.String(), waitErr.Error()))
		if ctx.Err() != nil {
			detail = ctx.Err().Error()
		}
		return bridge.ExecutionOutcome{}, fmt.Errorf("claude exec failed: %s", bridge.RedactText(detail))
	}
	changedFiles, err := bridge.CaptureChangedFiles(ctx, workdir)
	if err != nil {
		return bridge.ExecutionOutcome{}, fmt.Errorf("capture changed files: %w", err)
	}
	summary := bridge.RedactText(strings.TrimSpace(streamResult.FinalMessage))
	return bridge.ExecutionOutcome{
		Status:       "completed",
		Summary:      summary,
		Events:       events,
		ChangedFiles: changedFiles,
		Artifacts:    bridge.ExtractExecutionArtifacts(summary, events),
		Usage: map[string]int{
			"input_tokens":          streamResult.Usage.InputTokens,
			"output_tokens":         streamResult.Usage.OutputTokens,
			"cache_read_tokens":     streamResult.Usage.CacheReadTokens,
			"cache_creation_tokens": streamResult.Usage.CacheCreationTokens,
		},
	}, nil
}

func (c ClaudeExec) resolvePath() (string, error) {
	if strings.TrimSpace(c.Path) != "" {
		return strings.TrimSpace(c.Path), nil
	}
	lookPath := c.LookPath
	if lookPath == nil {
		lookPath = exec.LookPath
	}
	return lookPath("claude")
}

func (c ClaudeExec) args() []string {
	args := []string{
		"--print", "-",
		"--output-format", "stream-json",
		"--verbose",
		"--max-turns", "20",
		"--disable-slash-commands",
		"--setting-sources", "user",
	}
	if strings.TrimSpace(c.Model) != "" {
		args = append([]string{"--model", strings.TrimSpace(c.Model)}, args...)
	}
	return args
}

func (c ClaudeExec) command(ctx context.Context, name string, args ...string) *exec.Cmd {
	if c.CommandContext != nil {
		return c.CommandContext(ctx, name, args...)
	}
	return exec.CommandContext(ctx, name, args...)
}

func normalizeClaudeEvent(event provider.ClaudeStreamEvent) bridge.ProviderEvent {
	payload := map[string]any{}
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
		Type:    "claude." + strings.TrimSpace(event.Type),
		Payload: bridge.RedactValue(payload).(map[string]any),
	}
}
