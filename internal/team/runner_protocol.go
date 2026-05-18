package team

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

const (
	runnerTypeLocal   = "local"
	runnerTypeManaged = "managed"

	runnerStatusConnected    = "connected"
	runnerStatusDisconnected = "disconnected"
	runnerStatusStale        = "stale"
	runnerStatusRevoked      = "revoked"

	runnerJobStatusQueued    = "queued"
	runnerJobStatusLeased    = "leased"
	runnerJobStatusRunning   = "running"
	runnerJobStatusSucceeded = "succeeded"
	runnerJobStatusFailed    = "failed"
	runnerJobStatusCanceled  = "canceled"
	runnerJobStatusExpired   = "expired"

	defaultRunnerLeaseDuration     = 5 * time.Minute
	runnerCapabilityCommandTimeout = 2 * time.Second
	runnerDiagnosticLimit          = 20
	runnerLeaseExpiringDuration    = time.Minute
)

type hostedRunner struct {
	ID           string             `json:"id"`
	TeamID       string             `json:"team_id"`
	Name         string             `json:"name,omitempty"`
	RunnerType   string             `json:"runner_type"`
	Status       string             `json:"status"`
	TokenHash    string             `json:"token_hash,omitempty"`
	Capabilities runnerCapabilities `json:"capabilities,omitempty"`
	CreatedAt    string             `json:"created_at"`
	UpdatedAt    string             `json:"updated_at,omitempty"`
	LastSeenAt   string             `json:"last_seen_at,omitempty"`
	RevokedAt    string             `json:"revoked_at,omitempty"`
}

type runnerCapabilities struct {
	ProviderRuntimes []string               `json:"provider_runtimes,omitempty"`
	ExecutionModes   []string               `json:"execution_modes,omitempty"`
	CLIDetails       map[string]any         `json:"cli_details,omitempty"`
	PreflightChecks  []runnerPreflightCheck `json:"preflight_checks,omitempty"`
	GitAvailable     bool                   `json:"git_available"`
	GitVersion       string                 `json:"git_version,omitempty"`
	GHAvailable      bool                   `json:"gh_available"`
	GHAuthenticated  bool                   `json:"gh_authenticated"`
	OS               string                 `json:"os,omitempty"`
	Arch             string                 `json:"arch,omitempty"`
	Hostname         string                 `json:"hostname,omitempty"`
	WorkspaceRoot    string                 `json:"workspace_root,omitempty"`
}

type runnerPreflightCheck struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	Severity string `json:"severity,omitempty"`
	Summary  string `json:"summary,omitempty"`
	Detail   string `json:"detail,omitempty"`
}

type runnerJob struct {
	ID                   string            `json:"job_id"`
	TeamID               string            `json:"team_id"`
	ProjectID            string            `json:"project_id,omitempty"`
	TaskID               string            `json:"task_id,omitempty"`
	RunnerID             string            `json:"runner_id,omitempty"`
	AgentSlug            string            `json:"agent_slug,omitempty"`
	ExecutionMode        string            `json:"execution_mode,omitempty"`
	ProviderKind         string            `json:"provider_kind,omitempty"`
	RequiredProvider     string            `json:"-"`
	Status               string            `json:"status"`
	AgentMemoryPacket    AgentMemoryPacket `json:"agent_memory_packet,omitempty"`
	RequestedBy          string            `json:"requested_by,omitempty"`
	EffectivePermissions []string          `json:"effective_permissions,omitempty"`
	ModelMode            string            `json:"model_mode,omitempty"`
	IntentID             string            `json:"intent_id,omitempty"`
	ConfirmationID       string            `json:"confirmation_id,omitempty"`
	RepoURL              string            `json:"repo_url,omitempty"`
	WikiPath             string            `json:"wiki_path,omitempty"`
	LeaseExpiresAt       string            `json:"lease_expires_at,omitempty"`
	Attempts             int               `json:"attempts,omitempty"`
	LastError            string            `json:"last_error,omitempty"`
	CreatedAt            string            `json:"created_at"`
	UpdatedAt            string            `json:"updated_at,omitempty"`
	StartedAt            string            `json:"started_at,omitempty"`
	CompletedAt          string            `json:"completed_at,omitempty"`
}

type runnerDiagnostic struct {
	Kind      string         `json:"kind"`
	Severity  string         `json:"severity"`
	Title     string         `json:"title,omitempty"`
	Detail    string         `json:"detail,omitempty"`
	RunnerID  string         `json:"runner_id,omitempty"`
	JobID     string         `json:"job_id,omitempty"`
	TaskID    string         `json:"task_id,omitempty"`
	ProjectID string         `json:"project_id,omitempty"`
	Data      map[string]any `json:"data,omitempty"`
}

func (j *runnerJob) UnmarshalJSON(data []byte) error {
	type alias runnerJob
	var raw struct {
		alias
		LegacyID         string `json:"id"`
		RequiredProvider string `json:"required_provider"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*j = runnerJob(raw.alias)
	if strings.TrimSpace(j.ID) == "" {
		j.ID = strings.TrimSpace(raw.LegacyID)
	}
	if strings.TrimSpace(j.ProviderKind) == "" {
		j.ProviderKind = runnerOptionalProviderKind(raw.RequiredProvider)
	}
	if strings.TrimSpace(j.RequiredProvider) == "" {
		j.RequiredProvider = j.ProviderKind
	}
	return nil
}

type runnerJobEvent struct {
	ID        string         `json:"id"`
	TeamID    string         `json:"team_id"`
	JobID     string         `json:"job_id"`
	TaskID    string         `json:"task_id,omitempty"`
	RunnerID  string         `json:"runner_id,omitempty"`
	Kind      string         `json:"kind"`
	Level     string         `json:"level,omitempty"`
	Message   string         `json:"message,omitempty"`
	Payload   map[string]any `json:"payload,omitempty"`
	CreatedAt string         `json:"created_at"`
}

type runnerPairingCode struct {
	ID              string `json:"id"`
	TeamID          string `json:"team_id"`
	CodeHash        string `json:"code_hash,omitempty"`
	Status          string `json:"status"`
	CreatedBy       string `json:"created_by,omitempty"`
	CreatedAt       string `json:"created_at"`
	ExpiresAt       string `json:"expires_at"`
	ClaimedRunnerID string `json:"claimed_runner_id,omitempty"`
	ClaimedAt       string `json:"claimed_at,omitempty"`
}

type hostedWikiWriteRequest struct {
	ID          string `json:"id"`
	TeamID      string `json:"team_id"`
	ProjectID   string `json:"project_id,omitempty"`
	ArticlePath string `json:"article_path"`
	Status      string `json:"status"`
	RequestedBy string `json:"requested_by,omitempty"`
	RunnerID    string `json:"runner_id,omitempty"`
	CommitSHA   string `json:"commit_sha,omitempty"`
	Error       string `json:"error,omitempty"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at,omitempty"`
	CompletedAt string `json:"completed_at,omitempty"`
}

type hostedWikiArticleIndex struct {
	ID            string   `json:"id"`
	TeamID        string   `json:"team_id"`
	ProjectID     string   `json:"project_id,omitempty"`
	ArticlePath   string   `json:"article_path"`
	Title         string   `json:"title,omitempty"`
	LastCommit    string   `json:"last_commit,omitempty"`
	Excerpt       string   `json:"excerpt,omitempty"`
	Decisions     []string `json:"decisions,omitempty"`
	Risks         []string `json:"risks,omitempty"`
	OpenQuestions []string `json:"open_questions,omitempty"`
	UpdatedAt     string   `json:"updated_at,omitempty"`
}

func hashRunnerToken(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(sum[:])
}

func runnerTokenMatches(hash, token string) bool {
	hash = strings.TrimSpace(hash)
	tokenHash := hashRunnerToken(token)
	if hash == "" || tokenHash == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(hash), []byte(tokenHash)) == 1
}

func publicHostedRunner(r hostedRunner) hostedRunner {
	r.TokenHash = ""
	return r
}

func normalizeRunnerType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", runnerTypeLocal:
		return runnerTypeLocal
	case runnerTypeManaged:
		return runnerTypeManaged
	default:
		return runnerTypeLocal
	}
}

func normalizeRunnerStatus(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case runnerStatusConnected, runnerStatusDisconnected, runnerStatusStale, runnerStatusRevoked:
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return runnerStatusConnected
	}
}

func normalizeRunnerJobStatus(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case runnerJobStatusQueued, runnerJobStatusLeased, runnerJobStatusRunning, runnerJobStatusSucceeded, runnerJobStatusFailed, runnerJobStatusCanceled, runnerJobStatusExpired:
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return runnerJobStatusQueued
	}
}

func normalizeRunnerCapabilities(c runnerCapabilities) runnerCapabilities {
	c.ProviderRuntimes = normalizeStringList(c.ProviderRuntimes)
	c.ExecutionModes = normalizeStringList(c.ExecutionModes)
	for i := range c.ProviderRuntimes {
		c.ProviderRuntimes[i] = strings.ToLower(strings.TrimSpace(c.ProviderRuntimes[i]))
	}
	for i := range c.ExecutionModes {
		c.ExecutionModes[i] = strings.ToLower(strings.TrimSpace(c.ExecutionModes[i]))
	}
	c.OS = strings.TrimSpace(c.OS)
	c.Arch = strings.TrimSpace(c.Arch)
	c.Hostname = strings.TrimSpace(c.Hostname)
	c.WorkspaceRoot = strings.TrimSpace(c.WorkspaceRoot)
	c.GitVersion = strings.TrimSpace(c.GitVersion)
	c.PreflightChecks = normalizeRunnerPreflightChecks(c.PreflightChecks)
	return c
}

func detectLocalRunnerCapabilities(workspaceRoot string) runnerCapabilities {
	hostname, _ := os.Hostname()
	caps := runnerCapabilities{
		OS:            runtime.GOOS,
		Arch:          runtime.GOARCH,
		Hostname:      hostname,
		WorkspaceRoot: strings.TrimSpace(workspaceRoot),
		CLIDetails:    map[string]any{},
	}
	if caps.WorkspaceRoot == "" {
		caps.WorkspaceRoot, _ = os.Getwd()
	}
	if path, err := exec.LookPath("git"); err == nil && strings.TrimSpace(path) != "" {
		caps.GitAvailable = true
		if out, err := runnerCommandOutputWithTimeout(runnerCapabilityCommandTimeout, "git", "--version"); err == nil {
			caps.GitVersion = strings.TrimSpace(string(out))
		}
	}
	caps.PreflightChecks = append(caps.PreflightChecks, runnerToolPreflightCheck(
		"git",
		caps.GitAvailable,
		"git available",
		"git not found",
		"Local worktree jobs need git on the runner machine.",
		"warn",
	))
	if path, err := exec.LookPath("gh"); err == nil && strings.TrimSpace(path) != "" {
		caps.GHAvailable = true
		if err := runnerCommandRunWithTimeout(runnerCapabilityCommandTimeout, "gh", "auth", "status"); err == nil {
			caps.GHAuthenticated = true
		}
	}
	if caps.GHAvailable {
		caps.PreflightChecks = append(caps.PreflightChecks, runnerToolPreflightCheck(
			"github_auth",
			caps.GHAuthenticated,
			"github cli authenticated",
			"github cli not authenticated",
			"Repository delivery and PR checks may need `gh auth login` on the runner machine.",
			"warn",
		))
	} else {
		caps.PreflightChecks = append(caps.PreflightChecks, runnerPreflightCheck{
			ID:       "github_auth",
			Status:   "fail",
			Severity: "warn",
			Summary:  "github cli not found",
			Detail:   "Repository delivery and PR checks may need the GitHub CLI on the runner machine.",
		})
	}
	if commandExists("claude", "claude-code") {
		caps.ProviderRuntimes = append(caps.ProviderRuntimes, "claude-code")
		caps.CLIDetails["claude-code"] = runnerCLIDetail("claude")
	}
	if commandExists("codex") {
		caps.ProviderRuntimes = append(caps.ProviderRuntimes, "codex")
		caps.CLIDetails["codex"] = runnerCLIDetail("codex")
	}
	if commandExists("opencode") {
		caps.ProviderRuntimes = append(caps.ProviderRuntimes, "opencode")
		caps.CLIDetails["opencode"] = runnerCLIDetail("opencode")
	}
	caps.PreflightChecks = append(caps.PreflightChecks, runnerToolPreflightCheck(
		"provider_runtime",
		len(caps.ProviderRuntimes) > 0,
		"provider runtime available",
		"provider runtime not found",
		"Install Codex CLI, Claude Code CLI, or OpenCode where LAF Bridge can find it.",
		"critical",
	))
	caps.ExecutionModes = []string{executionModeOffice}
	if caps.GitAvailable {
		caps.ExecutionModes = append(caps.ExecutionModes, executionModeLocalWorktree)
	}
	return normalizeRunnerCapabilities(caps)
}

func runnerToolPreflightCheck(id string, ok bool, passSummary, failSummary, failDetail, failSeverity string) runnerPreflightCheck {
	if ok {
		return runnerPreflightCheck{
			ID:       id,
			Status:   "pass",
			Severity: "info",
			Summary:  passSummary,
		}
	}
	return runnerPreflightCheck{
		ID:       id,
		Status:   "fail",
		Severity: failSeverity,
		Summary:  failSummary,
		Detail:   failDetail,
	}
}

func normalizeRunnerPreflightChecks(checks []runnerPreflightCheck) []runnerPreflightCheck {
	const maxRunnerPreflightChecks = 12
	if len(checks) == 0 {
		return nil
	}
	out := make([]runnerPreflightCheck, 0, len(checks))
	seen := map[string]struct{}{}
	for _, check := range checks {
		id := strings.ToLower(strings.TrimSpace(check.ID))
		id = strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
				return r
			}
			return -1
		}, id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		status := normalizeRunnerPreflightStatus(check.Status)
		severity := normalizeRunnerPreflightSeverity(check.Severity, status)
		out = append(out, runnerPreflightCheck{
			ID:       id,
			Status:   status,
			Severity: severity,
			Summary:  truncateSummary(redactRunnerSensitiveText(check.Summary), 120),
			Detail:   truncateSummary(redactRunnerSensitiveText(check.Detail), 240),
		})
		if len(out) >= maxRunnerPreflightChecks {
			break
		}
	}
	return out
}

func normalizeRunnerPreflightStatus(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "pass", "ok", "ready":
		return "pass"
	case "warn", "warning":
		return "warn"
	case "fail", "failed", "error":
		return "fail"
	default:
		return "fail"
	}
}

func normalizeRunnerPreflightSeverity(raw, status string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "critical":
		return "critical"
	case "warn", "warning", "error":
		return "warn"
	case "info":
		return "info"
	}
	if status == "fail" || status == "warn" {
		return "warn"
	}
	return "info"
}

func runnerCLIDetail(name string) map[string]string {
	detail := map[string]string{"detected": "true"}
	if path, err := exec.LookPath(name); err == nil {
		detail["path"] = path
	}
	return detail
}

func runnerCommandOutputWithTimeout(timeout time.Duration, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).Output()
}

func runnerCommandRunWithTimeout(timeout time.Duration, name string, args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).Run()
}

func commandExists(names ...string) bool {
	for _, name := range names {
		if path, err := exec.LookPath(name); err == nil && strings.TrimSpace(path) != "" {
			return true
		}
	}
	return false
}

var runnerSecretRedactionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)Bearer\s+[A-Za-z0-9._~+/=-]+`),
	regexp.MustCompile(`laf_runner_[A-Fa-f0-9]{20,}`),
	regexp.MustCompile(`lafr_[A-Za-z0-9_-]{20,}`),
	regexp.MustCompile(`gh[pousr]_[A-Za-z0-9_]{20,}`),
	regexp.MustCompile(`sk-(proj-)?[A-Za-z0-9_-]{20,}`),
}

func runnerOptionalProviderKind(raw string) string {
	switch strings.ToLower(strings.TrimSpace(strings.ReplaceAll(raw, "_", "-"))) {
	case "":
		return ""
	case "claude", "claude-code":
		return "claude-code"
	case "codex":
		return "codex"
	case "opencode":
		return "opencode"
	case "openclaw":
		return "openclaw"
	case "laf-cloud", "lafcloud":
		return "laf-cloud"
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func redactRunnerSensitiveText(text string) string {
	text = strings.TrimSpace(text)
	for _, pattern := range runnerSecretRedactionPatterns {
		text = pattern.ReplaceAllString(text, "[REDACTED]")
	}
	return text
}

func redactRunnerSensitiveValue(value any) any {
	switch v := value.(type) {
	case string:
		return redactRunnerSensitiveText(v)
	case []any:
		out := make([]any, 0, len(v))
		for _, item := range v {
			out = append(out, redactRunnerSensitiveValue(item))
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			lower := strings.ToLower(key)
			if strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "password") || strings.Contains(lower, "api_key") || strings.Contains(lower, "apikey") {
				out[key] = "[REDACTED]"
				continue
			}
			out[key] = redactRunnerSensitiveValue(item)
		}
		return out
	default:
		return value
	}
}

func (b *Broker) normalizeRunnerStateLocked() {
	seenRunners := make(map[string]struct{}, len(b.runners))
	runners := make([]hostedRunner, 0, len(b.runners))
	for _, runner := range b.runners {
		runner.ID = strings.TrimSpace(runner.ID)
		runner.TeamID = strings.TrimSpace(runner.TeamID)
		if runner.ID == "" || runner.TeamID == "" {
			continue
		}
		if _, ok := seenRunners[runner.ID]; ok {
			continue
		}
		seenRunners[runner.ID] = struct{}{}
		runner.RunnerType = normalizeRunnerType(runner.RunnerType)
		runner.Status = normalizeRunnerStatus(runner.Status)
		if strings.TrimSpace(runner.RevokedAt) != "" {
			runner.Status = runnerStatusRevoked
		}
		runner.Capabilities = normalizeRunnerCapabilities(runner.Capabilities)
		runners = append(runners, runner)
	}
	b.runners = runners

	jobs := make([]runnerJob, 0, len(b.runnerJobs))
	for _, job := range b.runnerJobs {
		job.ID = strings.TrimSpace(job.ID)
		job.TeamID = strings.TrimSpace(job.TeamID)
		if job.ID == "" || job.TeamID == "" {
			continue
		}
		job.ProjectID = normalizeProjectID(job.ProjectID)
		job.TaskID = strings.TrimSpace(job.TaskID)
		job.RunnerID = strings.TrimSpace(job.RunnerID)
		job.AgentSlug = normalizeChannelSlug(job.AgentSlug)
		job.ExecutionMode = strings.TrimSpace(job.ExecutionMode)
		job.ProviderKind = runnerOptionalProviderKind(firstNonEmptyString(job.ProviderKind, job.RequiredProvider))
		job.RequiredProvider = job.ProviderKind
		job.Status = normalizeRunnerJobStatus(job.Status)
		job.RepoURL = strings.TrimSpace(job.RepoURL)
		job.WikiPath = strings.TrimSpace(job.WikiPath)
		jobs = append(jobs, job)
	}
	b.runnerJobs = jobs
}

func (b *Broker) findRunnerByTokenLocked(token string) (*hostedRunner, bool) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, false
	}
	for i := range b.runners {
		runner := &b.runners[i]
		if runner.Status == runnerStatusRevoked || strings.TrimSpace(runner.RevokedAt) != "" {
			continue
		}
		if runnerTokenMatches(runner.TokenHash, token) {
			return runner, true
		}
	}
	return nil, false
}

func (b *Broker) findRunnerJobLocked(id string) *runnerJob {
	id = strings.TrimSpace(id)
	for i := range b.runnerJobs {
		if b.runnerJobs[i].ID == id {
			return &b.runnerJobs[i]
		}
	}
	return nil
}

func (b *Broker) appendRunnerJobEventLocked(job runnerJob, runnerID, kind, level, message string, payload map[string]any, now string) runnerJobEvent {
	event := runnerJobEvent{
		ID:        "runner-event-" + generateToken(),
		TeamID:    job.TeamID,
		JobID:     job.ID,
		TaskID:    job.TaskID,
		RunnerID:  strings.TrimSpace(runnerID),
		Kind:      strings.TrimSpace(kind),
		Level:     strings.TrimSpace(level),
		Message:   redactRunnerSensitiveText(message),
		Payload:   redactRunnerSensitivePayload(payload),
		CreatedAt: now,
	}
	if event.Kind == "" {
		event.Kind = "progress"
	}
	b.runnerJobEvents = append(b.runnerJobEvents, event)
	return event
}

func redactRunnerSensitivePayload(payload map[string]any) map[string]any {
	if payload == nil {
		return nil
	}
	if redacted, ok := redactRunnerSensitiveValue(payload).(map[string]any); ok {
		return redacted
	}
	return nil
}

func (b *Broker) requeueExpiredRunnerJobsLocked(now time.Time) {
	nowText := now.UTC().Format(time.RFC3339)
	for i := range b.runnerJobs {
		job := &b.runnerJobs[i]
		switch job.Status {
		case runnerJobStatusLeased, runnerJobStatusRunning:
			if runnerLeaseExpired(job.LeaseExpiresAt, now) {
				previousRunner := job.RunnerID
				job.Status = runnerJobStatusQueued
				job.RunnerID = ""
				job.LeaseExpiresAt = ""
				job.LastError = "runner lease expired"
				job.UpdatedAt = nowText
				b.appendRunnerJobEventLocked(*job, previousRunner, runnerJobStatusExpired, "warn", "runner lease expired; job requeued", nil, nowText)
			}
		}
	}
}

func runnerLeaseExpired(leaseExpiresAt string, now time.Time) bool {
	leaseExpiresAt = strings.TrimSpace(leaseExpiresAt)
	if leaseExpiresAt == "" {
		return true
	}
	expiresAt, err := time.Parse(time.RFC3339, leaseExpiresAt)
	if err != nil {
		return true
	}
	return !expiresAt.After(now.UTC())
}

func runnerCanClaimJob(runner hostedRunner, job runnerJob) bool {
	if runner.TeamID != job.TeamID {
		return false
	}
	if runner.Status == runnerStatusRevoked || strings.TrimSpace(runner.RevokedAt) != "" {
		return false
	}
	if job.Status != runnerJobStatusQueued && job.Status != runnerJobStatusExpired {
		return false
	}
	if normalizeRunnerJobModelMode(job.ModelMode) != "team_bridge" {
		return false
	}
	if mode := strings.TrimSpace(job.ExecutionMode); mode != "" && len(runner.Capabilities.ExecutionModes) > 0 && !containsString(runner.Capabilities.ExecutionModes, mode) {
		return false
	}
	if requiredProvider := runnerOptionalProviderKind(job.ProviderKind); requiredProvider != "" && !containsString(runner.Capabilities.ProviderRuntimes, requiredProvider) {
		return false
	}
	return true
}

func runnerDiagnosticsForStatus(runners []hostedRunner, jobs []runnerJob, now time.Time) []runnerDiagnostic {
	diagnostics := make([]runnerDiagnostic, 0)
	appendDiagnostic := func(diagnostic runnerDiagnostic) {
		if len(diagnostics) >= runnerDiagnosticLimit {
			return
		}
		diagnostics = append(diagnostics, diagnostic)
	}

	connected := make([]hostedRunner, 0, len(runners))
	for _, runner := range runners {
		status := normalizeRunnerStatus(runner.Status)
		if status == runnerStatusRevoked || strings.TrimSpace(runner.RevokedAt) != "" {
			continue
		}
		if status == runnerStatusConnected && runnerLooksStale(runner.LastSeenAt, now) {
			status = runnerStatusStale
		}
		if status == runnerStatusConnected {
			connected = append(connected, runner)
			for _, diagnostic := range runnerPreflightDiagnostics(runner) {
				appendDiagnostic(diagnostic)
			}
			continue
		}
		if status == runnerStatusStale || status == runnerStatusDisconnected {
			appendDiagnostic(runnerDiagnostic{
				Kind:     "runner_unavailable",
				Severity: "info",
				Title:    "Runner unavailable",
				Detail:   "A registered runner is stale or disconnected.",
				RunnerID: runner.ID,
				Data: map[string]any{
					"status":       status,
					"last_seen_at": runner.LastSeenAt,
				},
			})
		}
	}

	for _, job := range jobs {
		status := normalizeRunnerJobStatus(job.Status)
		if status == runnerJobStatusQueued || status == runnerJobStatusExpired {
			if normalizeRunnerJobModelMode(job.ModelMode) != "team_bridge" {
				continue
			}
			if len(connected) == 0 {
				appendDiagnostic(runnerDiagnostic{
					Kind:      "no_connected_runner",
					Severity:  "critical",
					Title:     "No connected runner",
					Detail:    "A queued team bridge job has no connected runner.",
					JobID:     job.ID,
					TaskID:    job.TaskID,
					ProjectID: job.ProjectID,
				})
			} else if !anyRunnerCanClaimJob(connected, job) {
				appendDiagnostic(runnerCapabilityDiagnostic(connected, job))
			}
			if job.Attempts >= 3 {
				appendDiagnostic(runnerDiagnostic{
					Kind:      "repeated_attempts",
					Severity:  "warn",
					Title:     "Runner job retried repeatedly",
					Detail:    "A queued runner job has already been leased several times.",
					JobID:     job.ID,
					TaskID:    job.TaskID,
					ProjectID: job.ProjectID,
					Data:      map[string]any{"attempts": job.Attempts},
				})
			}
			continue
		}
		if status == runnerJobStatusLeased || status == runnerJobStatusRunning {
			if runnerLeaseExpiring(job.LeaseExpiresAt, now) {
				appendDiagnostic(runnerDiagnostic{
					Kind:      "lease_expiring",
					Severity:  "warn",
					Title:     "Runner lease expiring",
					Detail:    "A running runner job lease is close to expiring.",
					RunnerID:  job.RunnerID,
					JobID:     job.ID,
					TaskID:    job.TaskID,
					ProjectID: job.ProjectID,
					Data:      map[string]any{"lease_expires_at": job.LeaseExpiresAt},
				})
			}
		}
	}

	return diagnostics
}

func runnerPreflightDiagnostics(runner hostedRunner) []runnerDiagnostic {
	diagnostics := make([]runnerDiagnostic, 0)
	for _, check := range runner.Capabilities.PreflightChecks {
		status := normalizeRunnerPreflightStatus(check.Status)
		if status == "pass" {
			continue
		}
		diagnostics = append(diagnostics, runnerDiagnostic{
			Kind:     "runner_preflight_failed",
			Severity: normalizeRunnerPreflightSeverity(check.Severity, status),
			Title:    firstNonEmptyString(check.Summary, "Runner preflight check failed"),
			Detail:   check.Detail,
			RunnerID: runner.ID,
			Data: map[string]any{
				"check_id": check.ID,
				"status":   status,
			},
		})
	}
	return diagnostics
}

func anyRunnerCanClaimJob(runners []hostedRunner, job runnerJob) bool {
	for _, runner := range runners {
		if runnerCanClaimJob(runner, job) {
			return true
		}
	}
	return false
}

func runnerCapabilityDiagnostic(runners []hostedRunner, job runnerJob) runnerDiagnostic {
	kind := "no_capable_runner"
	title := "No capable runner"
	detail := "Connected runners do not match the queued job requirements."
	if isLocalWorktreeExecutionMode(job.ExecutionMode) && !anyRunnerHasGit(runners) {
		kind = "runner_missing_git"
		title = "Runner missing git"
		detail = "The queued local-worktree job needs git on a connected runner."
	} else if isLocalWorktreeExecutionMode(job.ExecutionMode) && strings.TrimSpace(job.RepoURL) != "" && !anyRunnerHasGitHubAuth(runners) {
		kind = "runner_missing_github_auth"
		title = "Runner missing GitHub auth"
		detail = "The queued repository job needs an authenticated GitHub CLI on a connected runner."
	} else if !anyRunnerSupportsExecutionMode(runners, job.ExecutionMode) {
		kind = "runner_missing_execution_mode"
		title = "Runner missing execution mode"
		detail = "Connected runners do not advertise the job execution mode."
	} else if !anyRunnerSupportsProvider(runners, job.ProviderKind) {
		kind = "runner_missing_provider"
		title = "Runner missing provider"
		detail = "Connected runners do not advertise the required provider runtime."
	}
	return runnerDiagnostic{
		Kind:      kind,
		Severity:  "critical",
		Title:     title,
		Detail:    detail,
		JobID:     job.ID,
		TaskID:    job.TaskID,
		ProjectID: job.ProjectID,
		Data: map[string]any{
			"execution_mode": job.ExecutionMode,
			"provider_kind":  runnerOptionalProviderKind(job.ProviderKind),
		},
	}
}

func anyRunnerHasGit(runners []hostedRunner) bool {
	for _, runner := range runners {
		if runner.Capabilities.GitAvailable {
			return true
		}
	}
	return false
}

func anyRunnerHasGitHubAuth(runners []hostedRunner) bool {
	for _, runner := range runners {
		if runner.Capabilities.GHAuthenticated {
			return true
		}
	}
	return false
}

func anyRunnerSupportsExecutionMode(runners []hostedRunner, mode string) bool {
	mode = strings.TrimSpace(mode)
	if mode == "" {
		return true
	}
	for _, runner := range runners {
		if len(runner.Capabilities.ExecutionModes) == 0 || containsString(runner.Capabilities.ExecutionModes, mode) {
			return true
		}
	}
	return false
}

func anyRunnerSupportsProvider(runners []hostedRunner, provider string) bool {
	provider = runnerOptionalProviderKind(provider)
	if provider == "" {
		return true
	}
	for _, runner := range runners {
		if containsString(runner.Capabilities.ProviderRuntimes, provider) {
			return true
		}
	}
	return false
}

func runnerLeaseExpiring(leaseExpiresAt string, now time.Time) bool {
	leaseExpiresAt = strings.TrimSpace(leaseExpiresAt)
	if leaseExpiresAt == "" {
		return false
	}
	expiresAt, err := time.Parse(time.RFC3339, leaseExpiresAt)
	if err != nil {
		return true
	}
	remaining := expiresAt.UTC().Sub(now.UTC())
	return remaining > 0 && remaining <= runnerLeaseExpiringDuration
}

func (b *Broker) enqueueRunnerJobForTaskLocked(task teamTask, now time.Time) runnerJob {
	nowText := now.UTC().Format(time.RFC3339)
	project := b.findProjectLocked(task.ProjectID)
	repoURL := ""
	if project != nil {
		repoURL = strings.TrimSpace(project.GitHubRepoURL)
	}
	job := runnerJob{
		ID:                "runner-job-" + generateToken(),
		TeamID:            b.teamIDForProjectTaskLocked(task),
		ProjectID:         normalizeProjectID(task.ProjectID),
		TaskID:            strings.TrimSpace(task.ID),
		AgentSlug:         normalizeChannelSlug(task.Owner),
		ExecutionMode:     strings.TrimSpace(task.ExecutionMode),
		ProviderKind:      b.runnerJobProviderKindForTaskLocked(task),
		Status:            runnerJobStatusQueued,
		AgentMemoryPacket: b.agentMemoryPacketForTaskLocked(task),
		RequestedBy:       firstNonEmptyString(task.HumanOwnerUserID, task.CreatedBy),
		ModelMode:         normalizeModelMode(task.ModelMode),
		RepoURL:           repoURL,
		WikiPath:          projectWikiArticlePath(task.ProjectID),
		CreatedAt:         nowText,
		UpdatedAt:         nowText,
	}
	if job.TeamID == "" {
		job.TeamID = "team-local"
	}
	if requester := b.findAuthUserByIDLocked(strings.TrimSpace(job.RequestedBy)); requester != nil {
		job.EffectivePermissions = effectivePermissions(requester.Role, requester.Permissions)
	}
	b.runnerJobs = append(b.runnerJobs, job)
	return job
}

func (b *Broker) runnerJobProviderKindForTaskLocked(task teamTask) string {
	if b == nil {
		return ""
	}
	member := b.findMemberLocked(task.Owner)
	if member == nil {
		return ""
	}
	return runnerOptionalProviderKind(member.Provider.Kind)
}

func runnerJobsEnabled() bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv(product.Env("RUNNER_JOBS_ENABLED"))))
	return raw != "0" && raw != "false" && raw != "off"
}

func hostedExecutionBoundaryEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(product.Env("EXECUTION_BOUNDARY")))) {
	case "runner", "hosted", "hybrid":
		return true
	}
	raw := strings.ToLower(strings.TrimSpace(os.Getenv(product.Env("HOSTED_CONTROL_PLANE"))))
	return raw == "1" || raw == "true" || raw == "yes"
}

func taskNeedsRunnerJob(task teamTask) bool {
	if strings.TrimSpace(task.ID) == "" || strings.TrimSpace(task.Owner) == "" {
		return false
	}
	if task.Blocked || isTerminalTeamTaskStatus(task.Status) {
		return false
	}
	if normalizeModelMode(task.ModelMode) != "team_bridge" {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(task.Status)) {
	case taskStatusInProgress, taskStatusReview:
		return true
	default:
		return false
	}
}

func (b *Broker) ensureRunnerJobForTaskLocked(task teamTask, now time.Time) (runnerJob, bool) {
	if !runnerJobsEnabled() || !taskNeedsRunnerJob(task) {
		return runnerJob{}, false
	}
	taskID := strings.TrimSpace(task.ID)
	for _, job := range b.runnerJobs {
		if strings.TrimSpace(job.TaskID) != taskID {
			continue
		}
		switch normalizeRunnerJobStatus(job.Status) {
		case runnerJobStatusQueued, runnerJobStatusLeased, runnerJobStatusRunning:
			return job, false
		}
	}
	job := b.enqueueRunnerJobForTaskLocked(task, now)
	b.appendRunnerJobEventLocked(job, "", runnerJobStatusQueued, "info", "runner job queued for task execution", nil, job.CreatedAt)
	return job, true
}

func (b *Broker) closeRunnerJobsForTaskLocked(taskID, actor, status, message, now string) int {
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		return 0
	}
	status = normalizeRunnerJobStatus(status)
	if status != runnerJobStatusSucceeded && status != runnerJobStatusFailed && status != runnerJobStatusCanceled {
		status = runnerJobStatusCanceled
	}
	count := 0
	for i := range b.runnerJobs {
		job := &b.runnerJobs[i]
		if strings.TrimSpace(job.TaskID) != taskID {
			continue
		}
		switch normalizeRunnerJobStatus(job.Status) {
		case runnerJobStatusQueued, runnerJobStatusLeased, runnerJobStatusRunning, runnerJobStatusExpired:
			job.Status = status
			job.LeaseExpiresAt = ""
			job.CompletedAt = now
			job.UpdatedAt = now
			if status != runnerJobStatusSucceeded {
				job.LastError = strings.TrimSpace(message)
			}
			payload := map[string]any{}
			if strings.TrimSpace(actor) != "" {
				payload["actor"] = strings.TrimSpace(actor)
			}
			b.appendRunnerJobEventLocked(*job, job.RunnerID, status, completionEventLevel(status), message, payload, now)
			count++
		}
	}
	return count
}

func runnerJobSummaryForTaskLocked(jobs []runnerJob, taskID string) *runnerJob {
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		return nil
	}
	for i := len(jobs) - 1; i >= 0; i-- {
		if strings.TrimSpace(jobs[i].TaskID) == taskID {
			job := jobs[i]
			return &job
		}
	}
	return nil
}

func (b *Broker) teamIDForProjectTaskLocked(task teamTask) string {
	if len(b.workspaceTeams) == 1 {
		return b.workspaceTeams[0].ID
	}
	if len(b.workspaceTeams) > 0 {
		return b.workspaceTeams[0].ID
	}
	return ""
}
