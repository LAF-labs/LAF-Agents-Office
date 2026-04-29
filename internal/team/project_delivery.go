package team

import (
	"bytes"
	"context"
	"fmt"
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
	BlockedTask     *teamTask
}

type projectTaskDeliverySnapshot struct {
	Task teamTask
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
		}, nil
	}

	responseTask, blockErr := b.blockTaskForProjectDeliveryFailure(taskID, actor, now, err)
	if blockErr != nil {
		return projectTaskAutoDeliveryResult{}, blockErr
	}
	return projectTaskAutoDeliveryResult{BlockedTask: &responseTask}, nil
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
			return projectTaskAutoDeliveryResult{
				DeliveryURL:     url,
				DeliverySummary: projectTaskDeliverySummary(task, branch),
			}, nil
		}
		return projectTaskAutoDeliveryResult{}, err
	}
	url := firstGitHubPullRequestURL(string(out))
	if url == "" {
		return projectTaskAutoDeliveryResult{}, fmt.Errorf("gh pr create did not return a GitHub PR URL")
	}
	return projectTaskAutoDeliveryResult{
		DeliveryURL:     url,
		DeliverySummary: projectTaskDeliverySummary(task, branch),
	}, nil
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
