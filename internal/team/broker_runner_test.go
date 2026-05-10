package team

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

func TestRunnerRegisterAndHeartbeat(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	b.mu.Lock()
	b.workspaceTeams = []workspaceTeam{{ID: "team-a", Name: "Team A", Slug: "team-a"}}
	b.mu.Unlock()

	register := httptest.NewRecorder()
	req := runnerJSONRequest(t, http.MethodPost, "/runner/register", b.Token(), map[string]any{
		"team_id":     "team-a",
		"name":        "Mac runner",
		"runner_type": runnerTypeLocal,
	})
	b.requireAuth(b.handleRunnerRegister)(register, req)
	if register.Code != http.StatusOK {
		t.Fatalf("register status = %d: %s", register.Code, register.Body.String())
	}
	var registerBody struct {
		Runner      hostedRunner `json:"runner"`
		RunnerToken string       `json:"runner_token"`
	}
	if err := json.NewDecoder(register.Body).Decode(&registerBody); err != nil {
		t.Fatalf("decode register: %v", err)
	}
	if registerBody.Runner.TeamID != "team-a" || registerBody.Runner.TokenHash != "" || registerBody.RunnerToken == "" {
		t.Fatalf("register body = %+v token=%q", registerBody.Runner, registerBody.RunnerToken)
	}

	b.mu.Lock()
	stored := b.runners[0]
	b.mu.Unlock()
	if stored.TokenHash == "" || stored.TokenHash == registerBody.RunnerToken {
		t.Fatalf("runner token was not hashed in state")
	}

	heartbeat := httptest.NewRecorder()
	b.handleRunnerHeartbeat(heartbeat, runnerJSONRequest(t, http.MethodPost, "/runner/heartbeat", registerBody.RunnerToken, map[string]string{"status": runnerStatusConnected}))
	if heartbeat.Code != http.StatusOK {
		t.Fatalf("heartbeat status = %d: %s", heartbeat.Code, heartbeat.Body.String())
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.runners[0].Status != runnerStatusConnected || b.runners[0].LastSeenAt == "" {
		t.Fatalf("heartbeat did not update runner: %+v", b.runners[0])
	}
}

func TestRunnerPairingStartAndClaim(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	b.mu.Lock()
	b.workspaceTeams = []workspaceTeam{{ID: "team-a", Name: "Team A", Slug: "team-a"}}
	b.mu.Unlock()

	start := httptest.NewRecorder()
	b.requireAuth(b.handleRunnerPairingStart)(start, runnerJSONRequest(t, http.MethodPost, "/runner/pairing/start", b.Token(), map[string]string{
		"api_url": "https://office.test/api",
	}))
	if start.Code != http.StatusOK {
		t.Fatalf("pairing start status = %d: %s", start.Code, start.Body.String())
	}
	var startBody struct {
		APIURL  string `json:"api_url"`
		Pairing struct {
			Code      string `json:"code"`
			TeamID    string `json:"team_id"`
			ExpiresAt string `json:"expires_at"`
		} `json:"pairing"`
		Commands map[string]string `json:"commands"`
	}
	if err := json.NewDecoder(start.Body).Decode(&startBody); err != nil {
		t.Fatalf("decode pairing start: %v", err)
	}
	if startBody.Pairing.Code == "" || startBody.Pairing.TeamID != "team-a" || !strings.Contains(startBody.Commands["connect"], "--connect") {
		t.Fatalf("pairing start body = %+v", startBody)
	}

	claim := httptest.NewRecorder()
	b.handleRunnerPairingClaim(claim, runnerJSONRequest(t, http.MethodPost, "/runner/pairing/claim", "", map[string]any{
		"code": startBody.Pairing.Code,
		"name": "Windows runner",
		"capabilities": runnerCapabilities{
			ExecutionModes:   []string{executionModeOffice},
			ProviderRuntimes: []string{"codex"},
		},
	}))
	if claim.Code != http.StatusOK {
		t.Fatalf("pairing claim status = %d: %s", claim.Code, claim.Body.String())
	}
	var claimBody struct {
		Runner      hostedRunner `json:"runner"`
		RunnerToken string       `json:"runner_token"`
	}
	if err := json.NewDecoder(claim.Body).Decode(&claimBody); err != nil {
		t.Fatalf("decode pairing claim: %v", err)
	}
	if claimBody.Runner.TeamID != "team-a" || claimBody.Runner.TokenHash != "" || claimBody.RunnerToken == "" {
		t.Fatalf("claim body = %+v token=%q", claimBody.Runner, claimBody.RunnerToken)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.runners) != 1 || b.runners[0].TokenHash == "" || len(b.runnerPairingCodes) != 0 {
		t.Fatalf("pairing state not finalized: runners=%+v pairings=%+v", b.runners, b.runnerPairingCodes)
	}
}

func TestRunnerCLIPairClaimsSetupCode(t *testing.T) {
	t.Setenv(product.Env("RUNTIME_HOME"), t.TempDir())
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	b.mu.Lock()
	b.workspaceTeams = []workspaceTeam{{ID: "team-a", Name: "Team A", Slug: "team-a"}}
	b.mu.Unlock()

	start := httptest.NewRecorder()
	b.requireAuth(b.handleRunnerPairingStart)(start, runnerJSONRequest(t, http.MethodPost, "/runner/pairing/start", b.Token(), map[string]string{}))
	if start.Code != http.StatusOK {
		t.Fatalf("pairing start status = %d: %s", start.Code, start.Body.String())
	}
	var startBody struct {
		Pairing struct {
			Code string `json:"code"`
		} `json:"pairing"`
	}
	if err := json.NewDecoder(start.Body).Decode(&startBody); err != nil {
		t.Fatalf("decode pairing start: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/runner/pairing/claim", b.handleRunnerPairingClaim)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	var out bytes.Buffer
	var stderr bytes.Buffer
	if err := RunRunnerCommand(context.Background(), []string{"pair", "--api-url", srv.URL, "--code", startBody.Pairing.Code}, &out, &stderr); err != nil {
		t.Fatalf("runner pair: %v stderr=%s out=%s", err, stderr.String(), out.String())
	}
	cfg, err := loadRunnerCLIConfig()
	if err != nil {
		t.Fatalf("load runner config: %v", err)
	}
	if cfg.RunnerToken == "" || cfg.RunnerID == "" || cfg.TeamID != "team-a" {
		t.Fatalf("runner config not paired: %+v", cfg)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.runners) != 1 || b.runners[0].TeamID != "team-a" {
		t.Fatalf("runners = %+v", b.runners)
	}
}

func TestRunnerPairURLParser(t *testing.T) {
	values, err := parseRunnerPairURL("laf-runner://pair?api_url=https%3A%2F%2Foffice.test%2Fapi&code=ABCD-1234-EF56&connect=0&name=Desk")
	if err != nil {
		t.Fatalf("parse pair URL: %v", err)
	}
	if values.APIURL != "https://office.test/api" || values.Code != "ABCD-1234-EF56" || values.Name != "Desk" || values.Connect {
		t.Fatalf("pair URL values = %+v", values)
	}

	values, err = parseRunnerPairURL("laf-runner://pair/ABCD-1234-EF56?api-url=https%3A%2F%2Foffice.test%2Fapi")
	if err != nil {
		t.Fatalf("parse path pair URL: %v", err)
	}
	if values.Code != "ABCD-1234-EF56" || !values.Connect {
		t.Fatalf("path pair URL values = %+v", values)
	}
}

func TestRunnerCLIPairURLClaimsSetupCode(t *testing.T) {
	t.Setenv(product.Env("RUNTIME_HOME"), t.TempDir())
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	b.mu.Lock()
	b.workspaceTeams = []workspaceTeam{{ID: "team-a", Name: "Team A", Slug: "team-a"}}
	b.mu.Unlock()

	start := httptest.NewRecorder()
	b.requireAuth(b.handleRunnerPairingStart)(start, runnerJSONRequest(t, http.MethodPost, "/runner/pairing/start", b.Token(), map[string]string{}))
	if start.Code != http.StatusOK {
		t.Fatalf("pairing start status = %d: %s", start.Code, start.Body.String())
	}
	var startBody struct {
		Pairing struct {
			Code string `json:"code"`
		} `json:"pairing"`
	}
	if err := json.NewDecoder(start.Body).Decode(&startBody); err != nil {
		t.Fatalf("decode pairing start: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/runner/pairing/claim", b.handleRunnerPairingClaim)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	pairURL := "laf-runner://pair?api_url=" + url.QueryEscape(srv.URL) + "&code=" + url.QueryEscape(startBody.Pairing.Code) + "&connect=0"
	var out bytes.Buffer
	var stderr bytes.Buffer
	if err := RunRunnerCommand(context.Background(), []string{"pair-url", pairURL}, &out, &stderr); err != nil {
		t.Fatalf("runner pair-url: %v stderr=%s out=%s", err, stderr.String(), out.String())
	}
	cfg, err := loadRunnerCLIConfig()
	if err != nil {
		t.Fatalf("load runner config: %v", err)
	}
	if cfg.RunnerToken == "" || cfg.TeamID != "team-a" {
		t.Fatalf("runner config not paired through URL: %+v", cfg)
	}
}

func TestRunnerLeaseIsTeamScopedAndCapabilityMatched(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	token := seedRunnerForTest(b, "team-a", runnerCapabilities{ExecutionModes: []string{executionModeOffice}})
	b.mu.Lock()
	b.runnerJobs = []runnerJob{
		{ID: "job-team-b", TeamID: "team-b", Status: runnerJobStatusQueued, CreatedAt: time.Now().UTC().Format(time.RFC3339)},
		{ID: "job-local-worktree", TeamID: "team-a", Status: runnerJobStatusQueued, ExecutionMode: executionModeLocalWorktree, CreatedAt: time.Now().UTC().Format(time.RFC3339)},
		{ID: "job-codex-only", TeamID: "team-a", Status: runnerJobStatusQueued, ExecutionMode: executionModeOffice, ProviderKind: "codex", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
		{ID: "job-team-a", TeamID: "team-a", Status: runnerJobStatusQueued, ExecutionMode: executionModeOffice, TaskID: "task-1", CreatedAt: time.Now().UTC().Format(time.RFC3339)},
	}
	b.mu.Unlock()

	rec := httptest.NewRecorder()
	b.handleRunnerJobsLease(rec, runnerJSONRequest(t, http.MethodPost, "/runner/jobs/lease", token, map[string]int{"lease_seconds": 300}))
	if rec.Code != http.StatusOK {
		t.Fatalf("lease status = %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Job *runnerJob `json:"job"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode lease: %v", err)
	}
	if body.Job == nil || body.Job.ID != "job-team-a" || body.Job.TeamID != "team-a" || body.Job.Status != runnerJobStatusLeased {
		t.Fatalf("leased job = %+v", body.Job)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.runnerJobs[0].Status != runnerJobStatusQueued || b.runnerJobs[1].Status != runnerJobStatusQueued || b.runnerJobs[2].Status != runnerJobStatusQueued {
		t.Fatalf("runner leased wrong job set: %+v", b.runnerJobs)
	}
}

func TestRunnerQueryTokenIsRejected(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	token := seedRunnerForTest(b, "team-a", runnerCapabilities{})

	req := httptest.NewRequest(http.MethodPost, "/runner/heartbeat?runner_token="+token, strings.NewReader(`{"status":"connected"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	b.handleRunnerHeartbeat(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("heartbeat with query token status = %d, want unauthorized", rec.Code)
	}
}

func TestRunnerLeaseRequeuesExpiredJob(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	_ = seedRunnerForTest(b, "team-a", runnerCapabilities{ExecutionModes: []string{executionModeOffice}})
	token2 := seedRunnerForTest(b, "team-a", runnerCapabilities{ExecutionModes: []string{executionModeOffice}})
	expired := time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
	b.mu.Lock()
	b.runnerJobs = []runnerJob{{
		ID:             "job-expired",
		TeamID:         "team-a",
		RunnerID:       "runner-old",
		Status:         runnerJobStatusLeased,
		ExecutionMode:  executionModeOffice,
		LeaseExpiresAt: expired,
		CreatedAt:      expired,
	}}
	b.mu.Unlock()

	rec := httptest.NewRecorder()
	b.handleRunnerJobsLease(rec, runnerJSONRequest(t, http.MethodPost, "/runner/jobs/lease", token2, map[string]int{"lease_seconds": 300}))
	if rec.Code != http.StatusOK {
		t.Fatalf("lease status = %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Job *runnerJob `json:"job"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode lease: %v", err)
	}
	if body.Job == nil || body.Job.ID != "job-expired" || body.Job.Status != runnerJobStatusLeased {
		t.Fatalf("expired job not re-leased: %+v", body.Job)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.runnerJobEvents) < 2 {
		t.Fatalf("expected expiry and lease events, got %+v", b.runnerJobEvents)
	}
	if b.runnerJobEvents[0].Kind != runnerJobStatusExpired {
		t.Fatalf("first event kind = %q, want expired", b.runnerJobEvents[0].Kind)
	}
}

func TestRevokedRunnerCannotHeartbeatOrLease(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	token := seedRunnerForTest(b, "team-a", runnerCapabilities{ExecutionModes: []string{executionModeOffice}})
	b.mu.Lock()
	b.runners[0].Status = runnerStatusRevoked
	b.runners[0].RevokedAt = time.Now().UTC().Format(time.RFC3339)
	b.runnerJobs = []runnerJob{{ID: "job-1", TeamID: "team-a", Status: runnerJobStatusQueued, ExecutionMode: executionModeOffice, CreatedAt: time.Now().UTC().Format(time.RFC3339)}}
	b.mu.Unlock()

	heartbeat := httptest.NewRecorder()
	b.handleRunnerHeartbeat(heartbeat, runnerJSONRequest(t, http.MethodPost, "/runner/heartbeat", token, map[string]string{"status": runnerStatusConnected}))
	if heartbeat.Code != http.StatusUnauthorized {
		t.Fatalf("heartbeat status = %d, want unauthorized: %s", heartbeat.Code, heartbeat.Body.String())
	}

	lease := httptest.NewRecorder()
	b.handleRunnerJobsLease(lease, runnerJSONRequest(t, http.MethodPost, "/runner/jobs/lease", token, map[string]int{"lease_seconds": 300}))
	if lease.Code != http.StatusUnauthorized {
		t.Fatalf("lease status = %d, want unauthorized: %s", lease.Code, lease.Body.String())
	}
}

func TestRunnerStatusListsRunnersAndJobsWithoutTokenHash(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	seedRunnerForTest(b, "team-a", runnerCapabilities{ExecutionModes: []string{executionModeOffice}})
	b.mu.Lock()
	b.runnerJobs = []runnerJob{{ID: "job-1", TeamID: "team-a", TaskID: "task-1", Status: runnerJobStatusQueued, CreatedAt: time.Now().UTC().Format(time.RFC3339)}}
	b.mu.Unlock()

	rec := httptest.NewRecorder()
	b.requireAuth(b.handleRunnerStatus)(rec, runnerJSONRequest(t, http.MethodGet, "/runner/status?task_id=task-1", b.Token(), nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("runner status = %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Runners []hostedRunner `json:"runners"`
		Jobs    []runnerJob    `json:"jobs"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if len(body.Runners) != 1 || body.Runners[0].TokenHash != "" {
		t.Fatalf("runners leaked token hash or missing: %+v", body.Runners)
	}
	if len(body.Jobs) != 1 || body.Jobs[0].ID != "job-1" {
		t.Fatalf("jobs = %+v", body.Jobs)
	}
}

func TestRunnerCompleteRecordsReceiptOnTask(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	token := seedRunnerForTest(b, "team-a", runnerCapabilities{ExecutionModes: []string{executionModeOffice}})
	now := time.Now().UTC().Format(time.RFC3339)
	b.mu.Lock()
	runnerID := b.runners[0].ID
	b.tasks = []teamTask{{ID: "task-1", Title: "Ship", Status: taskStatusInProgress, ExecutionMode: executionModeOffice, CreatedAt: now, UpdatedAt: now}}
	b.runnerJobs = []runnerJob{{ID: "job-1", TeamID: "team-a", TaskID: "task-1", RunnerID: runnerID, Status: runnerJobStatusLeased, LeaseExpiresAt: time.Now().UTC().Add(5 * time.Minute).Format(time.RFC3339), CreatedAt: now}}
	b.mu.Unlock()

	rec := httptest.NewRecorder()
	b.handleRunnerJobSubpath(rec, runnerJSONRequest(t, http.MethodPost, "/runner/jobs/job-1/complete", token, map[string]any{
		"status":                   runnerJobStatusSucceeded,
		"delivery_url":             "https://github.com/LAF-labs/agent-lab/pull/42",
		"delivery_summary":         "Implemented hosted runner bridge.",
		"delivery_status":          "open",
		"delivery_review_decision": "approved",
		"delivery_checks_status":   "passing",
		"delivery_merge_state":     "clean",
		"delivery_checked_at":      now,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("complete status = %d: %s", rec.Code, rec.Body.String())
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.runnerJobs[0].Status != runnerJobStatusSucceeded {
		t.Fatalf("job status = %q", b.runnerJobs[0].Status)
	}
	if b.tasks[0].DeliveryURL == "" || b.tasks[0].DeliverySummary == "" || b.tasks[0].DeliveryChecksStatus != "passing" {
		t.Fatalf("task receipt not updated: %+v", b.tasks[0])
	}
}

func TestRunnerJobEventCompleteAndRenewRequireActiveLease(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	token := seedRunnerForTest(b, "team-a", runnerCapabilities{ExecutionModes: []string{executionModeOffice}})
	now := time.Now().UTC().Format(time.RFC3339)
	b.mu.Lock()
	runnerID := b.runners[0].ID
	b.runnerJobs = []runnerJob{
		{ID: "job-queued", TeamID: "team-a", TaskID: "task-1", Status: runnerJobStatusQueued, CreatedAt: now},
		{ID: "job-leased", TeamID: "team-a", TaskID: "task-2", RunnerID: runnerID, Status: runnerJobStatusLeased, LeaseExpiresAt: time.Now().UTC().Add(2 * time.Minute).Format(time.RFC3339), CreatedAt: now},
	}
	b.mu.Unlock()

	event := httptest.NewRecorder()
	b.handleRunnerJobSubpath(event, runnerJSONRequest(t, http.MethodPost, "/runner/jobs/job-queued/events", token, map[string]string{"kind": "running"}))
	if event.Code != http.StatusConflict {
		t.Fatalf("queued event status = %d, want conflict: %s", event.Code, event.Body.String())
	}

	complete := httptest.NewRecorder()
	b.handleRunnerJobSubpath(complete, runnerJSONRequest(t, http.MethodPost, "/runner/jobs/job-queued/complete", token, map[string]string{"status": runnerJobStatusSucceeded}))
	if complete.Code != http.StatusConflict {
		t.Fatalf("queued complete status = %d, want conflict: %s", complete.Code, complete.Body.String())
	}

	renew := httptest.NewRecorder()
	b.handleRunnerJobSubpath(renew, runnerJSONRequest(t, http.MethodPost, "/runner/jobs/job-leased/renew", token, map[string]int{"lease_seconds": 300}))
	if renew.Code != http.StatusOK {
		t.Fatalf("renew status = %d: %s", renew.Code, renew.Body.String())
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.runnerJobs[1].LeaseExpiresAt == "" || len(b.runnerJobEvents) == 0 || b.runnerJobEvents[len(b.runnerJobEvents)-1].Kind != "renewed" {
		t.Fatalf("renew did not persist lease/event: job=%+v events=%+v", b.runnerJobs[1], b.runnerJobEvents)
	}
}

func TestRunnerWikiWriteResultUpdatesHostedIndex(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	token := seedRunnerForTest(b, "team-a", runnerCapabilities{})

	rec := httptest.NewRecorder()
	b.handleRunnerWikiWriteResult(rec, runnerJSONRequest(t, http.MethodPost, "/runner/wiki/write-result", token, map[string]any{
		"request_id":     "wiki-write-1",
		"project_id":     "agent-lab",
		"article_path":   "team/projects/agent-lab.md",
		"title":          "Agent Lab",
		"status":         runnerJobStatusSucceeded,
		"commit_sha":     "abc123",
		"excerpt":        "Project memory",
		"decisions":      []string{"Use local runner first"},
		"risks":          []string{"Runner offline"},
		"open_questions": []string{"Managed runner later?"},
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("wiki write result status = %d: %s", rec.Code, rec.Body.String())
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.wikiWriteRequests) != 1 || b.wikiWriteRequests[0].CommitSHA != "abc123" {
		t.Fatalf("wiki write requests = %+v", b.wikiWriteRequests)
	}
	if len(b.wikiArticleIndex) != 1 || b.wikiArticleIndex[0].ArticlePath != "team/projects/agent-lab.md" || len(b.wikiArticleIndex[0].Decisions) != 1 {
		t.Fatalf("wiki article index = %+v", b.wikiArticleIndex)
	}
}

func TestHostedTaskCreationQueuesRunnerJobWithoutLocalWorktree(t *testing.T) {
	t.Setenv(product.Env("HOSTED_CONTROL_PLANE"), "1")
	root := filepath.Join(t.TempDir(), "wiki")
	backup := filepath.Join(t.TempDir(), "wiki.bak")
	repo := NewRepoAt(root, backup)
	if err := repo.Init(context.Background()); err != nil {
		t.Fatalf("init wiki repo: %v", err)
	}

	b := newTestBroker(t)
	worker := NewWikiWorker(repo, b)
	ctx, cancel := context.WithCancel(context.Background())
	worker.Start(ctx)
	t.Cleanup(func() {
		cancel()
		worker.Stop()
	})
	b.mu.Lock()
	b.workspaceTeams = []workspaceTeam{{ID: "team-a", Name: "Team A", Slug: "team-a"}}
	b.wikiWorker = worker
	b.mu.Unlock()
	project := createProjectForTest(t, b, map[string]string{
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "https://github.com/LAF-labs/agent-lab.git",
	})
	_, _, err := worker.Enqueue(
		context.Background(),
		"human",
		projectWikiArticlePath(project.ID),
		"# Agent Lab\n\n## Decisions\n\n- Use hosted runner jobs as the execution boundary.\n\n## Risks\n\n- Runner may be disconnected.\n",
		"replace",
		"seed canonical project memory",
	)
	if err != nil {
		t.Fatalf("seed project wiki: %v", err)
	}

	rec := httptest.NewRecorder()
	b.handlePostTask(rec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "create",
		"title":      "Implement hosted task execution",
		"details":    "Move this task through the runner boundary.",
		"owner":      "builder",
		"created_by": "human",
		"project_id": project.ID,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("create task status = %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Task      teamTask   `json:"task"`
		RunnerJob *runnerJob `json:"runner_job"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode task: %v", err)
	}
	if strings.TrimSpace(body.Task.WorktreePath) != "" || strings.TrimSpace(body.Task.WorktreeBranch) != "" {
		t.Fatalf("hosted task got local worktree fields: %+v", body.Task)
	}
	if body.RunnerJob == nil || body.RunnerJob.TaskID != body.Task.ID || body.RunnerJob.Status != runnerJobStatusQueued {
		t.Fatalf("runner job not returned: %+v", body.RunnerJob)
	}
	if body.RunnerJob.AgentMemoryPacket.Version != "agent-memory/v1" {
		t.Fatalf("runner job packet version = %q", body.RunnerJob.AgentMemoryPacket.Version)
	}
	if len(body.RunnerJob.AgentMemoryPacket.MustRead) == 0 || body.RunnerJob.AgentMemoryPacket.MustRead[0].Status != "loaded" {
		t.Fatalf("runner job did not receive canonical wiki context: %+v", body.RunnerJob.AgentMemoryPacket)
	}
	if len(body.RunnerJob.AgentMemoryPacket.Decisions) == 0 || !strings.Contains(body.RunnerJob.AgentMemoryPacket.Decisions[0].Text, "hosted runner jobs") {
		t.Fatalf("runner job packet missing wiki decisions: %+v", body.RunnerJob.AgentMemoryPacket.Decisions)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.runnerJobs) != 1 || b.runnerJobs[0].TaskID != body.Task.ID {
		t.Fatalf("stored runner jobs = %+v", b.runnerJobs)
	}
}

func TestTaskCancelCancelsActiveRunnerJob(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	now := time.Now().UTC().Format(time.RFC3339)
	b.mu.Lock()
	b.tasks = []teamTask{{ID: "task-1", Title: "Ship", Owner: "builder", Status: taskStatusInProgress, CreatedAt: now, UpdatedAt: now, Channel: "general"}}
	b.runnerJobs = []runnerJob{{ID: "job-1", TeamID: "team-local", TaskID: "task-1", Status: runnerJobStatusQueued, CreatedAt: now}}
	b.mu.Unlock()

	rec := httptest.NewRecorder()
	b.handlePostTask(rec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "cancel",
		"id":         "task-1",
		"created_by": "human",
		"details":    "No longer needed.",
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("cancel task status = %d: %s", rec.Code, rec.Body.String())
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.runnerJobs[0].Status != runnerJobStatusCanceled || b.runnerJobs[0].CompletedAt == "" {
		t.Fatalf("runner job not canceled: %+v", b.runnerJobs[0])
	}
}

func TestRunnerCLIConnectExecutesAndCompletesLeasedJob(t *testing.T) {
	t.Setenv(product.Env("RUNTIME_HOME"), t.TempDir())
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	b.mu.Lock()
	b.workspaceTeams = []workspaceTeam{{ID: "team-a", Name: "Team A", Slug: "team-a"}}
	now := time.Now().UTC().Format(time.RFC3339)
	b.tasks = []teamTask{{ID: "task-1", Title: "Ship", Status: taskStatusInProgress, ExecutionMode: executionModeOffice, CreatedAt: now, UpdatedAt: now}}
	b.runnerJobs = []runnerJob{{ID: "job-1", TeamID: "team-a", TaskID: "task-1", Status: runnerJobStatusQueued, ExecutionMode: executionModeOffice, CreatedAt: now}}
	b.mu.Unlock()

	mux := http.NewServeMux()
	mux.HandleFunc("/runner/register", b.requireAuth(b.handleRunnerRegister))
	mux.HandleFunc("/runner/heartbeat", b.handleRunnerHeartbeat)
	mux.HandleFunc("/runner/capabilities", b.handleRunnerCapabilities)
	mux.HandleFunc("/runner/jobs/lease", b.handleRunnerJobsLease)
	mux.HandleFunc("/runner/jobs/", b.handleRunnerJobSubpath)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	oldExecute := runnerCLIExecuteJob
	runnerCLIExecuteJob = func(_ context.Context, job runnerJob, _ io.Writer) (runnerExecutionResult, error) {
		if job.ID != "job-1" || job.TaskID != "task-1" {
			t.Fatalf("unexpected job passed to executor: %+v", job)
		}
		return runnerExecutionResult{
			Status:          runnerJobStatusSucceeded,
			Message:         "done",
			DeliveryURL:     "https://github.com/LAF-labs/agent-lab/pull/7",
			DeliverySummary: "Implemented through runner.",
		}, nil
	}
	t.Cleanup(func() { runnerCLIExecuteJob = oldExecute })
	t.Setenv(product.Env("API_KEY"), b.Token())

	var out bytes.Buffer
	var stderr bytes.Buffer
	if err := RunRunnerCommand(context.Background(), []string{"connect", "--once", "--api-url", srv.URL, "--team-id", "team-a"}, &out, &stderr); err != nil {
		t.Fatalf("runner connect: %v stderr=%s out=%s", err, stderr.String(), out.String())
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.runnerJobs[0].Status != runnerJobStatusSucceeded {
		t.Fatalf("job status = %q", b.runnerJobs[0].Status)
	}
	if b.tasks[0].DeliveryURL != "https://github.com/LAF-labs/agent-lab/pull/7" || b.tasks[0].DeliverySummary == "" {
		t.Fatalf("task receipt = %+v", b.tasks[0])
	}
}

func TestRunnerConnectOnceReportsCapabilitiesOnlyWhenChanged(t *testing.T) {
	b := NewBrokerAt(filepath.Join(t.TempDir(), "broker-state.json"))
	b.mu.Lock()
	b.workspaceTeams = []workspaceTeam{{ID: "team-a", Name: "Team A", Slug: "team-a"}}
	b.mu.Unlock()
	token := seedRunnerForTest(b, "team-a", runnerCapabilities{ExecutionModes: []string{executionModeOffice}})

	capabilityReports := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/runner/heartbeat", b.handleRunnerHeartbeat)
	mux.HandleFunc("/runner/capabilities", func(w http.ResponseWriter, r *http.Request) {
		capabilityReports++
		b.handleRunnerCapabilities(w, r)
	})
	mux.HandleFunc("/runner/jobs/lease", b.handleRunnerJobsLease)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	cfg := runnerCLIConfig{APIURL: srv.URL, TeamID: "team-a", RunnerToken: token}
	session := runnerConnectSession{}
	if _, err := runnerConnectOnce(context.Background(), &cfg, &session, io.Discard); err != nil {
		t.Fatalf("first runner connect once: %v", err)
	}
	if _, err := runnerConnectOnce(context.Background(), &cfg, &session, io.Discard); err != nil {
		t.Fatalf("second runner connect once: %v", err)
	}
	if capabilityReports != 1 {
		t.Fatalf("capability reports = %d, want 1", capabilityReports)
	}
}

func seedRunnerForTest(b *Broker, teamID string, caps runnerCapabilities) string {
	token := "test-token-" + generateToken()
	runnerID := "runner-" + teamID + "-" + generateToken()[:8]
	now := time.Now().UTC().Format(time.RFC3339)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.runners = append(b.runners, hostedRunner{
		ID:           runnerID,
		TeamID:       teamID,
		Name:         runnerID,
		RunnerType:   runnerTypeLocal,
		Status:       runnerStatusConnected,
		TokenHash:    hashRunnerToken(token),
		Capabilities: normalizeRunnerCapabilities(caps),
		CreatedAt:    now,
		UpdatedAt:    now,
		LastSeenAt:   now,
	})
	return token
}

func runnerJSONRequest(t *testing.T, method, path, token string, body any) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(body); err != nil {
		t.Fatalf("encode request: %v", err)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}
