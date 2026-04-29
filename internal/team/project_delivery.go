package team

import (
	"bytes"
	"context"
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
	CheckedAt       string
	BlockedTask     *teamTask
}

type projectTaskDeliverySnapshot struct {
	Task teamTask
}

type projectTaskDeliveryVerification struct {
	Status    string
	CheckedAt string
}

type githubPullRequestRef struct {
	Owner  string
	Repo   string
	Number string
	URL    string
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
			CheckedAt:       receipt.CheckedAt,
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

	status, err := verifyProjectTaskDeliveryURL(ctx, repoURL, worktreePath, deliveryURL)
	if err != nil {
		return projectTaskDeliveryVerification{}, err
	}
	if now = strings.TrimSpace(now); now == "" {
		now = time.Now().UTC().Format(time.RFC3339)
	}
	return projectTaskDeliveryVerification{Status: status, CheckedAt: now}, nil
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
			status, err := projectTaskPullRequestState(ctx, worktreePath, url)
			if err != nil {
				return projectTaskAutoDeliveryResult{}, err
			}
			return projectTaskAutoDeliveryResult{
				DeliveryURL:     url,
				DeliverySummary: projectTaskDeliverySummary(task, branch),
				DeliveryStatus:  status,
				CheckedAt:       time.Now().UTC().Format(time.RFC3339),
			}, nil
		}
		return projectTaskAutoDeliveryResult{}, err
	}
	url := firstGitHubPullRequestURL(string(out))
	if url == "" {
		return projectTaskAutoDeliveryResult{}, fmt.Errorf("gh pr create did not return a GitHub PR URL")
	}
	status, err := projectTaskPullRequestState(ctx, worktreePath, url)
	if err != nil {
		return projectTaskAutoDeliveryResult{}, err
	}
	return projectTaskAutoDeliveryResult{
		DeliveryURL:     url,
		DeliverySummary: projectTaskDeliverySummary(task, branch),
		DeliveryStatus:  status,
		CheckedAt:       time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func verifyProjectTaskDeliveryURL(ctx context.Context, repoURL, worktreePath, deliveryURL string) (string, error) {
	repoRef, ok := parseGitHubRepoRef(repoURL)
	if !ok {
		return "", fmt.Errorf("project GitHub repo URL is invalid")
	}
	prRef, ok := parseGitHubPullRequestURL(deliveryURL)
	if !ok {
		return "", fmt.Errorf("delivery_url must be a GitHub pull request URL")
	}
	if !strings.EqualFold(repoRef.Owner, prRef.Owner) || !strings.EqualFold(repoRef.Name, prRef.Repo) {
		return "", fmt.Errorf("delivery_url must point to project repo %s", repoRef.fullName())
	}
	status, err := projectTaskPullRequestState(ctx, worktreePath, prRef.URL)
	if err != nil {
		return "", fmt.Errorf("delivery_url PR could not be verified: %w", err)
	}
	if status == "" {
		status = "verified"
	}
	return status, nil
}

func projectTaskPullRequestState(ctx context.Context, worktreePath, prURL string) (string, error) {
	out, err := projectTaskRunGH(ctx, worktreePath, "pr", "view", prURL, "--json", "state", "--jq", ".state")
	if err != nil {
		return "", err
	}
	return normalizeProjectTaskDeliveryStatus(string(out)), nil
}

func normalizeProjectTaskDeliveryStatus(raw string) string {
	status := strings.ToLower(strings.TrimSpace(raw))
	switch status {
	case "open", "merged", "closed":
		return status
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
