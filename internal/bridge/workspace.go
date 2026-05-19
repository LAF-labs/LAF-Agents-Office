package bridge

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var managedCheckoutGitCommand = exec.CommandContext

var (
	managedRepoHTTPSPattern = regexp.MustCompile(`^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?/?$`)
	managedRepoSSHPattern   = regexp.MustCompile(`^git@github\.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$`)
)

type executionPolicy struct {
	GitHubRepoURL  string `json:"github_repo_url"`
	RepoURL        string `json:"repo_url"`
	ProjectLocalID string `json:"project_local_id"`
	ProjectName    string `json:"project_name"`
	ProjectSlug    string `json:"project_slug"`
	Source         string `json:"source"`
}

// WorkdirForPlan returns the local directory where a signed execution plan
// should run. Project plans with a signed GitHub repo URL use Bridge's managed
// checkout; home plans use Bridge's home workdir.
func WorkdirForPlan(ctx context.Context, plan ExecutionPlan) (string, error) {
	policy := planExecutionPolicy(plan)
	repoURL := firstNonEmptyString(policy.GitHubRepoURL, policy.RepoURL)
	if repoURL != "" && plan.ProjectID != nil && strings.TrimSpace(*plan.ProjectID) != "" {
		return ensureManagedCheckout(ctx, managedCheckoutRequest{
			ProjectID:   strings.TrimSpace(*plan.ProjectID),
			ProjectName: policy.ProjectName,
			ProjectSlug: firstNonEmptyString(policy.ProjectSlug, policy.ProjectLocalID),
			RepoURL:     repoURL,
		})
	}
	return ensureHomeWorkdir()
}

type managedCheckoutRequest struct {
	ProjectID   string
	ProjectName string
	ProjectSlug string
	RepoURL     string
}

func ensureManagedCheckout(ctx context.Context, req managedCheckoutRequest) (string, error) {
	repoURL, err := normalizeManagedRepoURL(req.RepoURL)
	if err != nil {
		return "", err
	}
	checkoutPath := managedCheckoutPath(req, repoURL)
	if info, err := os.Stat(checkoutPath); err == nil {
		if !info.IsDir() {
			return "", fmt.Errorf("managed checkout path exists but is not a directory: %s", checkoutPath)
		}
		if ok := isGitWorktree(ctx, checkoutPath); !ok {
			return "", fmt.Errorf("managed checkout exists but is not a git repository: %s", checkoutPath)
		}
		origin, err := gitOutput(ctx, "-C", checkoutPath, "remote", "get-url", "origin")
		if err != nil {
			return "", err
		}
		if normalizeRemoteForCompare(origin) != normalizeRemoteForCompare(repoURL) {
			return "", fmt.Errorf("managed checkout origin does not match signed project repository")
		}
		return checkoutPath, nil
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(checkoutPath), 0o700); err != nil {
		return "", err
	}
	if _, err := gitOutput(ctx, "clone", "--depth", "1", repoURL, checkoutPath); err != nil {
		return "", err
	}
	return checkoutPath, nil
}

func ensureHomeWorkdir() (string, error) {
	workdir := filepath.Join(DefaultExecutionWorkdir(), "home")
	if err := os.MkdirAll(workdir, 0o700); err != nil {
		return "", fmt.Errorf("prepare home execution workdir: %w", err)
	}
	return workdir, nil
}

func managedCheckoutPath(req managedCheckoutRequest, repoURL string) string {
	seed := firstNonEmptyString(req.ProjectSlug, req.ProjectName, req.ProjectID, "project")
	slug := slugPathComponent(seed)
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(repoURL))))
	return filepath.Join(
		DefaultExecutionWorkdir(),
		"projects",
		fmt.Sprintf("%s-%s", slug, hex.EncodeToString(sum[:])[:12]),
	)
}

func planExecutionPolicy(plan ExecutionPlan) executionPolicy {
	var policy executionPolicy
	raw := strings.TrimSpace(string(plan.Policy))
	if raw == "" || raw == "null" {
		return policy
	}
	_ = json.Unmarshal(plan.Policy, &policy)
	return policy
}

func normalizeManagedRepoURL(raw string) (string, error) {
	repoURL := strings.TrimSpace(raw)
	if repoURL == "" {
		return "", fmt.Errorf("managed checkout repository URL is required")
	}
	if managedRepoHTTPSPattern.MatchString(repoURL) {
		return strings.TrimSuffix(repoURL, "/"), nil
	}
	if managedRepoSSHPattern.MatchString(repoURL) {
		return repoURL, nil
	}
	return "", fmt.Errorf("managed checkout repository URL must be a GitHub HTTPS URL or git@github.com SSH URL")
}

func isGitWorktree(ctx context.Context, dir string) bool {
	out, err := gitOutput(ctx, "-C", dir, "rev-parse", "--is-inside-work-tree")
	return err == nil && strings.TrimSpace(out) == "true"
}

func gitOutput(ctx context.Context, args ...string) (string, error) {
	cmd := managedCheckoutGitCommand(ctx, "git", args...)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if text == "" {
			text = err.Error()
		}
		return text, fmt.Errorf("git %s failed: %s", strings.Join(args, " "), RedactText(text))
	}
	return text, nil
}

func normalizeRemoteForCompare(raw string) string {
	remote := strings.ToLower(strings.TrimSpace(raw))
	remote = strings.TrimSuffix(remote, "/")
	remote = strings.TrimSuffix(remote, ".git")
	return remote
}

func slugPathComponent(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		return "project"
	}
	if len(slug) > 48 {
		return strings.Trim(slug[:48], "-")
	}
	return slug
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
