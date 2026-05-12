package team

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/gitexec"
)

const projectTaskPullRequestTimeout = 30 * time.Second

var projectTaskRunGit = defaultProjectTaskRunGit
var projectTaskRunGH = defaultProjectTaskRunGH

var githubPullRequestURLPattern = regexp.MustCompile(`https://github\.com/[^\s"'<>]+/[^\s"'<>]+/pull/[0-9]+`)

type projectTaskAutoDeliveryResult struct {
	DeliveryURL     string
	DeliverySummary string
	DeliveryStatus  string
	ReviewDecision  string
	ChecksStatus    string
	MergeState      string
	CheckedAt       string
	Draft           bool
	BlockedTask     *teamTask
}

type projectTaskDeliverySnapshot struct {
	Task teamTask
}

type projectTaskDeliveryVerification struct {
	Status         string
	ReviewDecision string
	ChecksStatus   string
	MergeState     string
	CheckedAt      string
	Draft          bool
}

type githubPullRequestRef struct {
	Owner  string
	Repo   string
	Number string
	URL    string
}

type projectTaskPullRequestSnapshot struct {
	Status         string
	ReviewDecision string
	ChecksStatus   string
	MergeState     string
	Draft          bool
}

func (b *Broker) findTaskLocked(id string) *teamTask {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil
	}
	for i := range b.tasks {
		if strings.TrimSpace(b.tasks[i].ID) == id {
			return &b.tasks[i]
		}
	}
	return nil
}

func actionMayNeedProjectAutoDelivery(action string) bool {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "review", "complete", "approve":
		return true
	default:
		return false
	}
}

func (b *Broker) prepareProjectTaskAutoDelivery(ctx context.Context, taskID, actor, action, now string) (projectTaskAutoDeliveryResult, error) {
	if b == nil || !actionMayNeedProjectAutoDelivery(action) || strings.TrimSpace(taskID) == "" {
		return projectTaskAutoDeliveryResult{}, nil
	}

	b.mu.Lock()
	task := b.findTaskLocked(taskID)
	if task == nil {
		b.mu.Unlock()
		return projectTaskAutoDeliveryResult{}, nil
	}
	if !b.canAccessChannelLocked(actor, normalizeChannelSlug(task.Channel)) {
		b.mu.Unlock()
		return projectTaskAutoDeliveryResult{}, nil
	}
	if !b.taskRequiresDeliveryReceiptLocked(task) || strings.TrimSpace(task.DeliveryURL) != "" {
		b.mu.Unlock()
		return projectTaskAutoDeliveryResult{}, nil
	}
	snapshot := projectTaskDeliverySnapshot{Task: *task}
	b.mu.Unlock()

	receipt, err := createProjectTaskPullRequest(ctx, snapshot)
	if err == nil {
		return projectTaskAutoDeliveryResult{
			DeliveryURL:     receipt.DeliveryURL,
			DeliverySummary: receipt.DeliverySummary,
			DeliveryStatus:  receipt.DeliveryStatus,
			ReviewDecision:  receipt.ReviewDecision,
			ChecksStatus:    receipt.ChecksStatus,
			MergeState:      receipt.MergeState,
			CheckedAt:       receipt.CheckedAt,
			Draft:           receipt.Draft,
		}, nil
	}

	responseTask, blockErr := b.blockTaskForProjectDeliveryFailure(taskID, actor, now, err)
	if blockErr != nil {
		return projectTaskAutoDeliveryResult{}, blockErr
	}
	return projectTaskAutoDeliveryResult{BlockedTask: &responseTask}, nil
}

func (b *Broker) prepareProjectTaskDeliveryVerification(ctx context.Context, taskID, actor, deliveryURL, now string) (projectTaskDeliveryVerification, error) {
	if b == nil || strings.TrimSpace(taskID) == "" {
		return projectTaskDeliveryVerification{}, nil
	}

	b.mu.Lock()
	task := b.findTaskLocked(taskID)
	if task == nil {
		b.mu.Unlock()
		return projectTaskDeliveryVerification{}, nil
	}
	if !b.canAccessChannelLocked(actor, normalizeChannelSlug(task.Channel)) {
		b.mu.Unlock()
		return projectTaskDeliveryVerification{}, nil
	}
	if !b.taskRequiresDeliveryReceiptLocked(task) {
		b.mu.Unlock()
		return projectTaskDeliveryVerification{}, nil
	}
	repoURL := b.taskProjectRepoURLLocked(task)
	worktreePath := strings.TrimSpace(task.WorktreePath)
	if strings.TrimSpace(deliveryURL) == "" {
		deliveryURL = strings.TrimSpace(task.DeliveryURL)
	}
	if strings.TrimSpace(deliveryURL) == "" {
		b.mu.Unlock()
		return projectTaskDeliveryVerification{}, nil
	}
	b.mu.Unlock()

	verification, err := verifyProjectTaskDeliveryURL(ctx, repoURL, worktreePath, deliveryURL)
	if err != nil {
		return projectTaskDeliveryVerification{}, err
	}
	if now = strings.TrimSpace(now); now == "" {
		now = time.Now().UTC().Format(time.RFC3339)
	}
	verification.CheckedAt = now
	return verification, nil
}

func (b *Broker) blockTaskForProjectDeliveryFailure(taskID, actor, now string, cause error) (teamTask, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	task := b.findTaskLocked(taskID)
	if task == nil {
		return teamTask{}, fmt.Errorf("task not found")
	}
	reason := "PR delivery failed: " + truncateSummary(cause.Error(), 220)
	task.Status = taskStatusBlocked
	task.Blocked = true
	task.UpdatedAt = now
	if actor = strings.TrimSpace(actor); actor == "" {
		actor = "system"
	}
	_ = appendTaskDetailLocked(task, reason)
	b.scheduleTaskLifecycleLocked(task)
	b.appendActionLocked("task_updated", "office", normalizeChannelSlug(task.Channel), actor, truncateSummary(task.Title+" ["+task.Status+"]", 140), task.ID)
	if err := b.saveLocked(); err != nil {
		return teamTask{}, err
	}
	return *task, nil
}

func createProjectTaskPullRequest(ctx context.Context, snapshot projectTaskDeliverySnapshot) (projectTaskAutoDeliveryResult, error) {
	task := snapshot.Task
	worktreePath := strings.TrimSpace(task.WorktreePath)
	if worktreePath == "" {
		return projectTaskAutoDeliveryResult{}, fmt.Errorf("working directory missing")
	}
	branch := strings.TrimSpace(task.WorktreeBranch)
	if branch == "" {
		return projectTaskAutoDeliveryResult{}, fmt.Errorf("working branch missing")
	}

	if _, err := projectTaskRunGit(ctx, worktreePath, "push", "-u", "origin", branch); err != nil {
		return projectTaskAutoDeliveryResult{}, err
	}

	base := projectTaskPRBaseBranch(ctx, worktreePath)
	out, err := projectTaskRunGH(
		ctx,
		worktreePath,
		"pr",
		"create",
		"--title",
		projectTaskPRTitle(task),
		"--body",
		projectTaskPRBody(task),
		"--head",
		branch,
		"--base",
		base,
	)
	if err != nil {
		if url, viewErr := existingProjectTaskPullRequestURL(ctx, worktreePath, branch); viewErr == nil && url != "" {
			prSnapshot, err := projectTaskPullRequestSnapshotForURL(ctx, worktreePath, url)
			if err != nil {
				return projectTaskAutoDeliveryResult{}, err
			}
			return projectTaskAutoDeliveryResult{
				DeliveryURL:     url,
				DeliverySummary: projectTaskDeliverySummary(task, branch),
				DeliveryStatus:  prSnapshot.Status,
				ReviewDecision:  prSnapshot.ReviewDecision,
				ChecksStatus:    prSnapshot.ChecksStatus,
				MergeState:      prSnapshot.MergeState,
				CheckedAt:       time.Now().UTC().Format(time.RFC3339),
				Draft:           prSnapshot.Draft,
			}, nil
		}
		if noDiff, diffErr := projectTaskBranchHasNoDiff(ctx, worktreePath, base); diffErr == nil && noDiff {
			url, receiptErr := projectTaskRepoReceiptURL(ctx, worktreePath)
			if receiptErr != nil {
				return projectTaskAutoDeliveryResult{}, receiptErr
			}
			return projectTaskAutoDeliveryResult{
				DeliveryURL:     url,
				DeliverySummary: projectTaskNoDiffDeliverySummary(task, branch),
				DeliveryStatus:  "receipt",
				CheckedAt:       time.Now().UTC().Format(time.RFC3339),
			}, nil
		}
		return projectTaskAutoDeliveryResult{}, err
	}
	url := firstGitHubPullRequestURL(string(out))
	if url == "" {
		return projectTaskAutoDeliveryResult{}, fmt.Errorf("gh pr create did not return a GitHub PR URL")
	}
	prSnapshot, err := projectTaskPullRequestSnapshotForURL(ctx, worktreePath, url)
	if err != nil {
		return projectTaskAutoDeliveryResult{}, err
	}
	return projectTaskAutoDeliveryResult{
		DeliveryURL:     url,
		DeliverySummary: projectTaskDeliverySummary(task, branch),
		DeliveryStatus:  prSnapshot.Status,
		ReviewDecision:  prSnapshot.ReviewDecision,
		ChecksStatus:    prSnapshot.ChecksStatus,
		MergeState:      prSnapshot.MergeState,
		CheckedAt:       time.Now().UTC().Format(time.RFC3339),
		Draft:           prSnapshot.Draft,
	}, nil
}

func verifyProjectTaskDeliveryURL(ctx context.Context, repoURL, worktreePath, deliveryURL string) (projectTaskDeliveryVerification, error) {
	repoRef, ok := parseGitHubRepoRef(repoURL)
	if !ok {
		return projectTaskDeliveryVerification{}, fmt.Errorf("project GitHub repo URL is invalid")
	}
	if receiptRef, ok := parseProjectTaskRepoReceiptURL(deliveryURL); ok {
		if !strings.EqualFold(repoRef.Owner, receiptRef.Owner) || !strings.EqualFold(repoRef.Name, receiptRef.Name) {
			return projectTaskDeliveryVerification{}, fmt.Errorf("delivery_url must point to project repo %s", repoRef.fullName())
		}
		base := projectTaskPRBaseBranch(ctx, worktreePath)
		noDiff, err := projectTaskBranchHasNoDiff(ctx, worktreePath, base)
		if err != nil || !noDiff {
			return projectTaskDeliveryVerification{}, fmt.Errorf("delivery_url repo receipt requires a no-diff branch")
		}
		return projectTaskDeliveryVerification{Status: "receipt"}, nil
	}
	prRef, ok := parseGitHubPullRequestURL(deliveryURL)
	if !ok {
		return projectTaskDeliveryVerification{}, fmt.Errorf("delivery_url must be a GitHub pull request URL or project repo URL")
	}
	if !strings.EqualFold(repoRef.Owner, prRef.Owner) || !strings.EqualFold(repoRef.Name, prRef.Repo) {
		return projectTaskDeliveryVerification{}, fmt.Errorf("delivery_url must point to project repo %s", repoRef.fullName())
	}
	snapshot, err := projectTaskPullRequestSnapshotForURL(ctx, worktreePath, prRef.URL)
	if err != nil {
		return projectTaskDeliveryVerification{}, fmt.Errorf("delivery_url PR could not be verified: %w", err)
	}
	if snapshot.Status == "" {
		snapshot.Status = "verified"
	}
	return projectTaskDeliveryVerification{
		Status:         snapshot.Status,
		ReviewDecision: snapshot.ReviewDecision,
		ChecksStatus:   snapshot.ChecksStatus,
		MergeState:     snapshot.MergeState,
		Draft:          snapshot.Draft,
	}, nil
}

func projectTaskPullRequestState(ctx context.Context, worktreePath, prURL string) (string, error) {
	snapshot, err := projectTaskPullRequestSnapshotForURL(ctx, worktreePath, prURL)
	if err != nil {
		return "", err
	}
	return snapshot.Status, nil
}

func projectTaskPullRequestSnapshotForURL(ctx context.Context, worktreePath, prURL string) (projectTaskPullRequestSnapshot, error) {
	out, err := projectTaskRunGH(ctx, worktreePath, "pr", "view", prURL, "--json", "state,reviewDecision,mergeStateStatus,statusCheckRollup,isDraft")
	if err != nil {
		return projectTaskPullRequestSnapshot{}, err
	}
	var response struct {
		State             string           `json:"state"`
		ReviewDecision    string           `json:"reviewDecision"`
		MergeStateStatus  string           `json:"mergeStateStatus"`
		StatusCheckRollup []map[string]any `json:"statusCheckRollup"`
		IsDraft           bool             `json:"isDraft"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(out), &response); err != nil {
		status := normalizeProjectTaskDeliveryStatus(string(out))
		if status == "" {
			return projectTaskPullRequestSnapshot{}, fmt.Errorf("parse gh pr view: %w", err)
		}
		return projectTaskPullRequestSnapshot{Status: status}, nil
	}
	return projectTaskPullRequestSnapshot{
		Status:         normalizeProjectTaskDeliveryStatus(response.State),
		ReviewDecision: normalizeProjectTaskReviewDecision(response.ReviewDecision),
		ChecksStatus:   normalizeProjectTaskChecksStatus(response.StatusCheckRollup),
		MergeState:     normalizeProjectTaskMergeState(response.MergeStateStatus),
		Draft:          response.IsDraft,
	}, nil
}

func normalizeProjectTaskDeliveryStatus(raw string) string {
	status := strings.ToLower(strings.TrimSpace(raw))
	switch status {
	case "open", "merged", "closed", "receipt":
		return status
	default:
		return ""
	}
}

func projectTaskBranchHasNoDiff(ctx context.Context, worktreePath, base string) (bool, error) {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "main"
	}
	if _, err := projectTaskRunGit(ctx, worktreePath, "diff", "--quiet", "origin/"+base+"...HEAD"); err != nil {
		return false, err
	}
	return true, nil
}

func projectTaskRepoReceiptURL(ctx context.Context, worktreePath string) (string, error) {
	out, err := projectTaskRunGit(ctx, worktreePath, "config", "--get", "remote.origin.url")
	if err != nil {
		return "", err
	}
	ref, ok := parseGitHubRepoRef(string(out))
	if !ok {
		return "", fmt.Errorf("remote origin is not a GitHub repo URL")
	}
	return "https://github.com/" + ref.fullName(), nil
}

func parseProjectTaskRepoReceiptURL(raw string) (githubRepoRef, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return githubRepoRef{}, false
	}
	parsed, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(parsed.Scheme, "https") || !strings.EqualFold(parsed.Hostname(), "github.com") {
		return githubRepoRef{}, false
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) != 2 {
		return githubRepoRef{}, false
	}
	return githubRepoRefFromPath(parts[0] + "/" + parts[1])
}

func normalizeProjectTaskReviewDecision(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	value = strings.ReplaceAll(value, " ", "_")
	value = strings.ReplaceAll(value, "-", "_")
	switch value {
	case "approved", "changes_requested", "review_required":
		return value
	default:
		return ""
	}
}

func normalizeProjectTaskMergeState(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	value = strings.ReplaceAll(value, " ", "_")
	value = strings.ReplaceAll(value, "-", "_")
	switch value {
	case "clean", "dirty", "blocked", "behind", "draft", "unstable", "unknown":
		return value
	default:
		return ""
	}
}

func normalizeProjectTaskChecksStatus(rollup []map[string]any) string {
	if len(rollup) == 0 {
		return "none"
	}
	hasPending := false
	hasUnknown := false
	for _, check := range rollup {
		state := projectTaskStringField(check, "state")
		status := projectTaskStringField(check, "status")
		conclusion := projectTaskStringField(check, "conclusion")
		if state == "" && status == "" && conclusion == "" {
			hasUnknown = true
			continue
		}
		switch normalizeProjectTaskCheckValue(state) {
		case "failure":
			return "failing"
		case "pending":
			hasPending = true
		case "unknown":
			hasUnknown = true
		}
		switch normalizeProjectTaskCheckValue(status) {
		case "failure":
			return "failing"
		case "pending":
			hasPending = true
		case "unknown":
			hasUnknown = true
		}
		switch normalizeProjectTaskCheckValue(conclusion) {
		case "failure":
			return "failing"
		case "pending":
			hasPending = true
		case "unknown":
			hasUnknown = true
		}
	}
	if hasPending {
		return "pending"
	}
	if hasUnknown {
		return "unknown"
	}
	return "passing"
}

func normalizeProjectTaskCheckValue(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "":
		return ""
	case "success", "successful", "passed", "completed", "neutral", "skipped":
		return "passing"
	case "failure", "failed", "error", "timed_out", "cancelled", "canceled", "action_required", "startup_failure", "stale":
		return "failure"
	case "pending", "queued", "requested", "waiting", "in_progress", "expected":
		return "pending"
	default:
		return "unknown"
	}
}

func projectTaskStringField(values map[string]any, key string) string {
	if values == nil {
		return ""
	}
	switch v := values[key].(type) {
	case string:
		return v
	default:
		return ""
	}
}

func parseGitHubPullRequestURL(raw string) (githubPullRequestRef, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return githubPullRequestRef{}, false
	}
	parsed, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(parsed.Scheme, "https") || !strings.EqualFold(parsed.Hostname(), "github.com") {
		return githubPullRequestRef{}, false
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) != 4 || !strings.EqualFold(parts[2], "pull") || !asciiDigits(parts[3]) {
		return githubPullRequestRef{}, false
	}
	ref, ok := githubRepoRefFromPath(parts[0] + "/" + parts[1])
	if !ok {
		return githubPullRequestRef{}, false
	}
	return githubPullRequestRef{
		Owner:  ref.Owner,
		Repo:   ref.Name,
		Number: parts[3],
		URL:    fmt.Sprintf("https://github.com/%s/%s/pull/%s", ref.Owner, ref.Name, parts[3]),
	}, true
}

func asciiDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func projectTaskPRBaseBranch(ctx context.Context, worktreePath string) string {
	out, err := projectTaskRunGit(ctx, worktreePath, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")
	if err != nil {
		return "main"
	}
	base := strings.TrimSpace(string(out))
	base = strings.TrimPrefix(base, "origin/")
	if base == "" || strings.ContainsAny(base, " \t\r\n") {
		return "main"
	}
	return base
}

func existingProjectTaskPullRequestURL(ctx context.Context, worktreePath, branch string) (string, error) {
	out, err := projectTaskRunGH(ctx, worktreePath, "pr", "view", "--head", branch, "--json", "url", "--jq", ".url")
	if err != nil {
		return "", err
	}
	url := firstGitHubPullRequestURL(string(out))
	if url == "" {
		return "", fmt.Errorf("gh pr view did not return a GitHub PR URL")
	}
	return url, nil
}

func projectTaskPRTitle(task teamTask) string {
	title := strings.TrimSpace(task.Title)
	if title == "" {
		title = strings.TrimSpace(task.ID)
	}
	if title == "" {
		title = "Project task delivery"
	}
	return title
}

func projectTaskPRBody(task teamTask) string {
	var body strings.Builder
	if id := strings.TrimSpace(task.ID); id != "" {
		body.WriteString("Task: #")
		body.WriteString(id)
		body.WriteString("\n\n")
	}
	if details := strings.TrimSpace(task.Details); details != "" {
		body.WriteString(details)
		body.WriteString("\n\n")
	}
	body.WriteString("Created by LAF-Office project task delivery.")
	return body.String()
}

func projectTaskDeliverySummary(task teamTask, branch string) string {
	title := strings.TrimSpace(task.Title)
	if title == "" {
		title = strings.TrimSpace(task.ID)
	}
	if title == "" {
		title = "project task"
	}
	if branch = strings.TrimSpace(branch); branch != "" {
		return truncateSummary(fmt.Sprintf("Opened PR for %s from branch %s.", title, branch), 220)
	}
	return truncateSummary("Opened PR for "+title+".", 220)
}

func projectTaskNoDiffDeliverySummary(task teamTask, branch string) string {
	title := strings.TrimSpace(task.Title)
	if title == "" {
		title = strings.TrimSpace(task.ID)
	}
	if title == "" {
		title = "project task"
	}
	if branch = strings.TrimSpace(branch); branch != "" {
		return truncateSummary(fmt.Sprintf("No code diff for %s; recorded runtime-state receipt from branch %s.", title, branch), 220)
	}
	return truncateSummary("No code diff for "+title+"; recorded runtime-state receipt.", 220)
}

func firstGitHubPullRequestURL(raw string) string {
	return githubPullRequestURLPattern.FindString(raw)
}

func defaultProjectTaskRunGit(ctx context.Context, dir string, args ...string) ([]byte, error) {
	return runProjectTaskCommand(ctx, dir, "git", args...)
}

func defaultProjectTaskRunGH(ctx context.Context, dir string, args ...string) ([]byte, error) {
	return runProjectTaskCommand(ctx, dir, "gh", args...)
}

func runProjectTaskCommand(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	runCtx, cancel := context.WithTimeout(ctx, projectTaskPullRequestTimeout)
	defer cancel()

	cmd := exec.CommandContext(runCtx, name, args...)
	cmd.Dir = dir
	cmd.Env = gitexec.CleanEnv()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" && runCtx.Err() != nil {
			detail = runCtx.Err().Error()
		}
		if detail == "" {
			detail = err.Error()
		}
		return nil, fmt.Errorf("%s %s: %s", name, strings.Join(args, " "), detail)
	}
	return stdout.Bytes(), nil
}
