package team

import (
	"bytes"
	"context"
	"fmt"
	"net/url"
	"os/exec"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/gitexec"
)

const projectRepoReadinessTimeout = 5 * time.Second

type projectRepoReadiness struct {
	ProjectID            string `json:"project_id"`
	RepoURL              string `json:"repo_url,omitempty"`
	Status               string `json:"status"`
	Message              string `json:"message"`
	CanCreateCodingTasks bool   `json:"can_create_coding_tasks"`
	DefaultBranch        string `json:"default_branch,omitempty"`
	CheckedAt            string `json:"checked_at"`
}

type githubRepoRef struct {
	Owner string
	Name  string
}

func (r githubRepoRef) fullName() string {
	if r.Owner == "" || r.Name == "" {
		return ""
	}
	return r.Owner + "/" + r.Name
}

var projectRepoLookPath = exec.LookPath
var projectRepoRunGH = defaultProjectRepoRunGH

func projectRepoReadinessForProject(project teamProject) projectRepoReadiness {
	repoURL := strings.TrimSpace(project.GitHubRepoURL)
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	base := projectRepoReadiness{
		ProjectID: project.ID,
		RepoURL:   repoURL,
		CheckedAt: checkedAt,
	}
	if repoURL == "" {
		base.Status = "not_connected"
		base.Message = "No GitHub repository is connected to this project."
		return base
	}

	ref, ok := parseGitHubRepoRef(repoURL)
	if !ok {
		base.Status = "invalid_url"
		base.Message = "Use a GitHub repo URL like https://github.com/org/repo or git@github.com:org/repo.git."
		return base
	}
	if _, err := projectRepoLookPath("gh"); err != nil {
		base.Status = "gh_missing"
		base.Message = "Install GitHub CLI so agents can open pull requests."
		return base
	}
	if _, err := projectRepoRunGH("auth", "status"); err != nil {
		base.Status = "auth_required"
		base.Message = "Run `gh auth login` so agents can access the repository and open pull requests."
		return base
	}

	defaultBranch, err := projectRepoDefaultBranch(ref)
	if err != nil {
		base.Status = "repo_unreachable"
		base.Message = fmt.Sprintf("GitHub CLI could not access %s: %v", ref.fullName(), err)
		return base
	}
	base.Status = "ready"
	base.Message = "GitHub CLI can access this repository."
	base.CanCreateCodingTasks = true
	base.DefaultBranch = defaultBranch
	return base
}

func projectRepoDefaultBranch(ref githubRepoRef) (string, error) {
	out, err := projectRepoRunGH(
		"repo",
		"view",
		ref.fullName(),
		"--json",
		"defaultBranchRef",
		"--jq",
		".defaultBranchRef.name",
	)
	if err != nil {
		return "", err
	}
	branch := strings.TrimSpace(string(out))
	if branch == "" {
		return "", fmt.Errorf("default branch not returned")
	}
	return branch, nil
}

func defaultProjectRepoRunGH(args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), projectRepoReadinessTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "gh", args...)
	cmd.Env = gitexec.CleanEnv()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" && ctx.Err() != nil {
			detail = ctx.Err().Error()
		}
		if detail == "" {
			detail = err.Error()
		}
		return nil, fmt.Errorf("gh %s: %s", strings.Join(args, " "), detail)
	}
	return stdout.Bytes(), nil
}

func parseGitHubRepoRef(raw string) (githubRepoRef, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return githubRepoRef{}, false
	}
	if strings.HasPrefix(raw, "git@github.com:") {
		return githubRepoRefFromPath(strings.TrimPrefix(raw, "git@github.com:"))
	}
	if strings.HasPrefix(raw, "github.com/") {
		raw = "https://" + raw
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return githubRepoRef{}, false
	}
	if !strings.EqualFold(parsed.Hostname(), "github.com") {
		return githubRepoRef{}, false
	}
	return githubRepoRefFromPath(parsed.Path)
}

func githubRepoRefFromPath(path string) (githubRepoRef, bool) {
	path = strings.Trim(strings.TrimSpace(path), "/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		return githubRepoRef{}, false
	}
	owner := strings.TrimSpace(parts[0])
	name := strings.TrimSuffix(strings.TrimSpace(parts[1]), ".git")
	if owner == "" || name == "" || strings.Contains(owner, " ") || strings.Contains(name, " ") {
		return githubRepoRef{}, false
	}
	return githubRepoRef{Owner: owner, Name: name}, true
}
