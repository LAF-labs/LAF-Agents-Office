package team

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
	"github.com/LAF-labs/LAF-Agents-Office/internal/provider"
)

type runnerCLIConfig struct {
	APIURL      string `json:"api_url,omitempty"`
	APIToken    string `json:"api_token,omitempty"`
	RunnerID    string `json:"runner_id,omitempty"`
	RunnerToken string `json:"runner_token,omitempty"`
	TeamID      string `json:"team_id,omitempty"`
	Name        string `json:"name,omitempty"`
}

type runnerExecutionResult struct {
	Status                 string
	Message                string
	DeliveryURL            string
	DeliverySummary        string
	DeliveryStatus         string
	DeliveryReviewDecision string
	DeliveryChecksStatus   string
	DeliveryMergeState     string
	DeliveryCheckedAt      string
	WorktreePath           string
	WorktreeBranch         string
}

var runnerCLIExecuteJob = defaultRunnerCLIExecuteJob

// RunRunnerCommand implements the local CLI runner surface used by the hosted
// control-plane protocol. The first implementation deliberately keeps execution
// local-only and talks to the same HTTP contract the future hosted API will use.
func RunRunnerCommand(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 {
		printRunnerHelp(stderr)
		return nil
	}
	switch args[0] {
	case "login":
		return runRunnerLogin(args[1:], stdout, stderr)
	case "connect":
		return runRunnerConnect(ctx, args[1:], stdout, stderr)
	case "status":
		return runRunnerStatus(args[1:], stdout, stderr)
	case "disconnect":
		return runRunnerDisconnect(args[1:], stdout, stderr)
	default:
		printRunnerHelp(stderr)
		return fmt.Errorf("unknown runner subcommand %q", args[0])
	}
}

func printRunnerHelp(w io.Writer) {
	fmt.Fprintln(w, "laf-office runner — connect a local execution runner")
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Usage:")
	fmt.Fprintln(w, "  laf-office runner login --api-url <url> --team-id <team> --api-token <token>")
	fmt.Fprintln(w, "  laf-office runner connect")
	fmt.Fprintln(w, "  laf-office runner status")
	fmt.Fprintln(w, "  laf-office runner disconnect")
}

func runRunnerLogin(args []string, stdout, stderr io.Writer) error {
	cfg, _ := loadRunnerCLIConfig()
	cfg.applyEnv()
	fs := flag.NewFlagSet("laf-office runner login", flag.ContinueOnError)
	fs.SetOutput(stderr)
	apiURL := fs.String("api-url", cfg.APIURL, "Hosted API URL")
	teamID := fs.String("team-id", cfg.TeamID, "Team ID to register this runner under")
	apiToken := fs.String("api-token", cfg.APIToken, "Hosted API/broker token used once for registration")
	name := fs.String("name", cfg.Name, "Runner display name")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg.APIURL = strings.TrimRight(strings.TrimSpace(*apiURL), "/")
	cfg.TeamID = strings.TrimSpace(*teamID)
	cfg.APIToken = strings.TrimSpace(*apiToken)
	cfg.Name = strings.TrimSpace(*name)
	if cfg.APIURL == "" {
		return errors.New("runner login requires --api-url")
	}
	if cfg.Name == "" {
		cfg.Name = defaultRunnerCLIName()
	}
	if err := saveRunnerCLIConfig(cfg); err != nil {
		return err
	}
	fmt.Fprintf(stdout, "Runner login saved at %s\n", runnerCLIConfigPath())
	return nil
}

func runRunnerStatus(args []string, stdout, stderr io.Writer) error {
	cfg, _ := loadRunnerCLIConfig()
	cfg.applyEnv()
	fs := flag.NewFlagSet("laf-office runner status", flag.ContinueOnError)
	fs.SetOutput(stderr)
	asJSON := fs.Bool("json", false, "Print JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	caps := detectLocalRunnerCapabilities("")
	if *asJSON {
		return json.NewEncoder(stdout).Encode(map[string]any{
			"api_url":      cfg.APIURL,
			"team_id":      cfg.TeamID,
			"runner_id":    cfg.RunnerID,
			"has_token":    cfg.RunnerToken != "",
			"capabilities": caps,
		})
	}
	fmt.Fprintf(stdout, "API URL: %s\n", valueOrUnset(cfg.APIURL))
	fmt.Fprintf(stdout, "Team ID: %s\n", valueOrUnset(cfg.TeamID))
	fmt.Fprintf(stdout, "Runner ID: %s\n", valueOrUnset(cfg.RunnerID))
	fmt.Fprintf(stdout, "Runner token: %s\n", runnerCLIYesNo(cfg.RunnerToken != ""))
	fmt.Fprintf(stdout, "Providers: %s\n", strings.Join(caps.ProviderRuntimes, ", "))
	fmt.Fprintf(stdout, "Execution modes: %s\n", strings.Join(caps.ExecutionModes, ", "))
	fmt.Fprintf(stdout, "git: %s", runnerCLIYesNo(caps.GitAvailable))
	if caps.GitVersion != "" {
		fmt.Fprintf(stdout, " (%s)", caps.GitVersion)
	}
	fmt.Fprintln(stdout)
	fmt.Fprintf(stdout, "gh: %s, authenticated: %s\n", runnerCLIYesNo(caps.GHAvailable), runnerCLIYesNo(caps.GHAuthenticated))
	return nil
}

func runRunnerDisconnect(args []string, stdout, stderr io.Writer) error {
	cfg, _ := loadRunnerCLIConfig()
	fs := flag.NewFlagSet("laf-office runner disconnect", flag.ContinueOnError)
	fs.SetOutput(stderr)
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg.RunnerID = ""
	cfg.RunnerToken = ""
	if err := saveRunnerCLIConfig(cfg); err != nil {
		return err
	}
	fmt.Fprintln(stdout, "Runner token removed from local config.")
	return nil
}

func runRunnerConnect(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	cfg, _ := loadRunnerCLIConfig()
	cfg.applyEnv()
	fs := flag.NewFlagSet("laf-office runner connect", flag.ContinueOnError)
	fs.SetOutput(stderr)
	apiURL := fs.String("api-url", cfg.APIURL, "Hosted API URL")
	teamID := fs.String("team-id", cfg.TeamID, "Team ID")
	once := fs.Bool("once", false, "Poll once and exit")
	interval := fs.Duration("interval", 10*time.Second, "Polling interval")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg.APIURL = strings.TrimRight(strings.TrimSpace(*apiURL), "/")
	cfg.TeamID = strings.TrimSpace(*teamID)
	if cfg.APIURL == "" {
		return errors.New("runner connect requires an API URL; run `laf-office runner login` first")
	}
	if cfg.Name == "" {
		cfg.Name = defaultRunnerCLIName()
	}

	for {
		leased, err := runnerConnectOnce(ctx, &cfg, stdout)
		if err != nil {
			return err
		}
		if err := saveRunnerCLIConfig(cfg); err != nil {
			return err
		}
		if *once {
			return nil
		}
		if !leased {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(*interval):
			}
		}
	}
}

func runnerConnectOnce(ctx context.Context, cfg *runnerCLIConfig, stdout io.Writer) (bool, error) {
	caps := detectLocalRunnerCapabilities("")
	if cfg.RunnerToken == "" {
		if cfg.APIToken == "" {
			return false, errors.New("runner registration requires --api-token or LAF_OFFICE_API_KEY")
		}
		var response struct {
			Runner      hostedRunner `json:"runner"`
			RunnerToken string       `json:"runner_token"`
		}
		if err := runnerPostJSON(ctx, cfg.APIURL, "/runner/register", cfg.APIToken, map[string]any{
			"team_id":      cfg.TeamID,
			"name":         cfg.Name,
			"runner_type":  runnerTypeLocal,
			"capabilities": caps,
		}, &response); err != nil {
			return false, err
		}
		cfg.RunnerID = response.Runner.ID
		cfg.TeamID = response.Runner.TeamID
		cfg.RunnerToken = response.RunnerToken
		fmt.Fprintf(stdout, "Registered runner %s for team %s\n", cfg.RunnerID, cfg.TeamID)
	}
	if err := runnerPostJSON(ctx, cfg.APIURL, "/runner/capabilities", cfg.RunnerToken, map[string]any{"capabilities": caps}, nil); err != nil {
		return false, err
	}
	if err := runnerPostJSON(ctx, cfg.APIURL, "/runner/heartbeat", cfg.RunnerToken, map[string]any{"status": runnerStatusConnected}, nil); err != nil {
		return false, err
	}
	var lease struct {
		Job *runnerJob `json:"job"`
	}
	if err := runnerPostJSON(ctx, cfg.APIURL, "/runner/jobs/lease", cfg.RunnerToken, map[string]any{"lease_seconds": int(defaultRunnerLeaseDuration.Seconds())}, &lease); err != nil {
		return false, err
	}
	if lease.Job == nil {
		fmt.Fprintln(stdout, "Runner connected; no queued job.")
		return false, nil
	}
	fmt.Fprintf(stdout, "Leased job %s for task %s.\n", lease.Job.ID, valueOrUnset(lease.Job.TaskID))
	if err := runnerPostJSON(ctx, cfg.APIURL, "/runner/jobs/"+lease.Job.ID+"/events", cfg.RunnerToken, map[string]any{
		"kind":    runnerJobStatusRunning,
		"status":  runnerJobStatusRunning,
		"level":   "info",
		"message": "runner started execution",
	}, nil); err != nil {
		return true, err
	}
	result, err := runnerCLIExecuteJob(ctx, *lease.Job, stdout)
	if err != nil {
		result.Status = runnerJobStatusFailed
		result.Message = err.Error()
	}
	if result.Status == "" {
		result.Status = runnerJobStatusSucceeded
	}
	if err := runnerPostJSON(ctx, cfg.APIURL, "/runner/jobs/"+lease.Job.ID+"/complete", cfg.RunnerToken, map[string]any{
		"status":                   result.Status,
		"message":                  result.Message,
		"error":                    runnerResultError(result),
		"delivery_url":             result.DeliveryURL,
		"delivery_summary":         result.DeliverySummary,
		"delivery_status":          result.DeliveryStatus,
		"delivery_review_decision": result.DeliveryReviewDecision,
		"delivery_checks_status":   result.DeliveryChecksStatus,
		"delivery_merge_state":     result.DeliveryMergeState,
		"delivery_checked_at":      result.DeliveryCheckedAt,
		"worktree_path":            result.WorktreePath,
		"worktree_branch":          result.WorktreeBranch,
	}, nil); err != nil {
		return true, err
	}
	fmt.Fprintf(stdout, "Completed job %s with status %s.\n", lease.Job.ID, result.Status)
	return true, nil
}

func defaultRunnerCLIExecuteJob(ctx context.Context, job runnerJob, stdout io.Writer) (runnerExecutionResult, error) {
	workspace, branch, err := prepareRunnerJobWorkspace(job)
	if err != nil {
		return runnerExecutionResult{Status: runnerJobStatusFailed, Message: err.Error()}, err
	}
	if workspace != "" {
		fmt.Fprintf(stdout, "Workspace: %s\n", workspace)
	}
	systemPrompt := "You are a LAF-Office local CLI runner. Execute the leased job using the local filesystem and installed CLIs. Preserve durable conclusions in the repo or wiki when the task asks for it. If you create a GitHub pull request with gh, include the PR URL in your final answer."
	userPrompt := runnerJobPrompt(job)
	outputCh := make(chan struct {
		text string
		err  error
	}, 1)
	go func() {
		text, runErr := provider.RunConfiguredOneShot(systemPrompt, userPrompt, workspace)
		outputCh <- struct {
			text string
			err  error
		}{text: text, err: runErr}
	}()
	select {
	case <-ctx.Done():
		return runnerExecutionResult{Status: runnerJobStatusCanceled, Message: ctx.Err().Error(), WorktreePath: workspace, WorktreeBranch: branch}, ctx.Err()
	case result := <-outputCh:
		if result.err != nil {
			return runnerExecutionResult{Status: runnerJobStatusFailed, Message: result.err.Error(), WorktreePath: workspace, WorktreeBranch: branch}, result.err
		}
		summary := truncateSummary(strings.TrimSpace(result.text), 1200)
		return runnerExecutionResult{
			Status:          runnerJobStatusSucceeded,
			Message:         summary,
			DeliverySummary: summary,
			DeliveryURL:     extractRunnerDeliveryURL(result.text),
			WorktreePath:    workspace,
			WorktreeBranch:  branch,
		}, nil
	}
}

func prepareRunnerJobWorkspace(job runnerJob) (string, string, error) {
	if isLocalWorktreeExecutionMode(job.ExecutionMode) {
		taskID := strings.TrimSpace(job.TaskID)
		if taskID == "" {
			taskID = strings.TrimSpace(job.ID)
		}
		if repoURL := strings.TrimSpace(job.RepoURL); repoURL != "" {
			return prepareProjectTaskWorktree(normalizeProjectID(job.ProjectID), repoURL, taskID)
		}
		return prepareTaskWorktree(taskID)
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", "", err
	}
	return cwd, "", nil
}

func runnerJobPrompt(job runnerJob) string {
	packet, _ := json.MarshalIndent(job.AgentMemoryPacket, "", "  ")
	var sb strings.Builder
	sb.WriteString("Execute this LAF-Office runner job.\n\n")
	fmt.Fprintf(&sb, "job_id: %s\nteam_id: %s\nproject_id: %s\ntask_id: %s\nagent_slug: %s\nexecution_mode: %s\nrepo_url: %s\nwiki_path: %s\n\n",
		job.ID,
		job.TeamID,
		job.ProjectID,
		job.TaskID,
		job.AgentSlug,
		job.ExecutionMode,
		job.RepoURL,
		job.WikiPath,
	)
	sb.WriteString("agent_memory_packet:\n")
	sb.Write(packet)
	sb.WriteString("\n\nReturn a concise completion summary. If a PR is created, include the PR URL.")
	return sb.String()
}

func runnerResultError(result runnerExecutionResult) string {
	if normalizeRunnerJobStatus(result.Status) == runnerJobStatusFailed {
		return strings.TrimSpace(result.Message)
	}
	return ""
}

var runnerDeliveryURLPattern = regexp.MustCompile(`https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+`)

func extractRunnerDeliveryURL(text string) string {
	return runnerDeliveryURLPattern.FindString(text)
}

func runnerPostJSON(ctx context.Context, apiURL, path, token string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(apiURL, "/")+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(token) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("runner API %s failed: %s: %s", path, resp.Status, strings.TrimSpace(string(data)))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func loadRunnerCLIConfig() (runnerCLIConfig, error) {
	var cfg runnerCLIConfig
	data, err := os.ReadFile(runnerCLIConfigPath())
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(data, &cfg)
	return cfg, err
}

func saveRunnerCLIConfig(cfg runnerCLIConfig) error {
	path := runnerCLIConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func runnerCLIConfigPath() string {
	home := config.RuntimeHomeDir()
	if home == "" {
		return product.RuntimePath("", "runner.json")
	}
	return product.RuntimePath(home, "runner.json")
}

func (cfg *runnerCLIConfig) applyEnv() {
	if v := strings.TrimSpace(os.Getenv(product.Env("HOSTED_API_URL"))); v != "" {
		cfg.APIURL = strings.TrimRight(v, "/")
	}
	if v := strings.TrimSpace(os.Getenv(product.Env("RUNNER_API_URL"))); v != "" {
		cfg.APIURL = strings.TrimRight(v, "/")
	}
	if v := strings.TrimSpace(os.Getenv(product.Env("RUNNER_TEAM_ID"))); v != "" {
		cfg.TeamID = v
	}
	if v := strings.TrimSpace(os.Getenv(product.Env("RUNNER_ID"))); v != "" {
		cfg.RunnerID = v
	}
	if v := strings.TrimSpace(os.Getenv(product.Env("RUNNER_TOKEN"))); v != "" {
		cfg.RunnerToken = v
	}
	if v := strings.TrimSpace(os.Getenv(product.Env("RUNNER_API_TOKEN"))); v != "" {
		cfg.APIToken = v
	}
	if v := strings.TrimSpace(os.Getenv(product.Env("API_KEY"))); v != "" && cfg.APIToken == "" {
		cfg.APIToken = v
	}
}

func defaultRunnerCLIName() string {
	hostname, _ := os.Hostname()
	hostname = strings.TrimSpace(hostname)
	if hostname == "" {
		return "Local runner"
	}
	return hostname
}

func valueOrUnset(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "(unset)"
	}
	return value
}

func runnerCLIYesNo(ok bool) string {
	if ok {
		return "yes"
	}
	return "no"
}
