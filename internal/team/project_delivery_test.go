package team

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestCreateProjectTaskPullRequestUsesExistingPRWhenCreateConflicts(t *testing.T) {
	oldRunGit := projectTaskRunGit
	oldRunGH := projectTaskRunGH
	t.Cleanup(func() {
		projectTaskRunGit = oldRunGit
		projectTaskRunGH = oldRunGH
	})

	projectTaskRunGit = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "push -u origin laf-office-task-1":
			return []byte("pushed\n"), nil
		case "symbolic-ref --short refs/remotes/origin/HEAD":
			return []byte("origin/main\n"), nil
		default:
			t.Fatalf("unexpected git call: %v", args)
			return nil, nil
		}
	}
	projectTaskRunGH = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "pr create --title Implement signup --body Task: #task-1\n\nCreated by LAF-Office project task delivery. --head laf-office-task-1 --base main":
			return nil, errors.New("pull request already exists")
		case "pr view --head laf-office-task-1 --json url --jq .url":
			return []byte("https://github.com/LAF-labs/customer-portal/pull/9\n"), nil
		case projectTaskPRViewCommand("https://github.com/LAF-labs/customer-portal/pull/9"):
			return projectTaskPRViewResponse("MERGED", "APPROVED", "CLEAN", false, "SUCCESS"), nil
		default:
			t.Fatalf("unexpected gh call: %v", args)
			return nil, nil
		}
	}

	receipt, err := createProjectTaskPullRequest(context.Background(), projectTaskDeliverySnapshot{
		Task: teamTask{
			ID:             "task-1",
			Title:          "Implement signup",
			WorktreePath:   "/tmp/customer-portal-task-1",
			WorktreeBranch: "laf-office-task-1",
		},
	})
	if err != nil {
		t.Fatalf("create pull request: %v", err)
	}
	if receipt.DeliveryURL != "https://github.com/LAF-labs/customer-portal/pull/9" {
		t.Fatalf("delivery url = %q", receipt.DeliveryURL)
	}
	if !strings.Contains(receipt.DeliverySummary, "laf-office-task-1") {
		t.Fatalf("delivery summary = %q", receipt.DeliverySummary)
	}
	if receipt.DeliveryStatus != "merged" || strings.TrimSpace(receipt.CheckedAt) == "" {
		t.Fatalf("delivery verification = %q at %q", receipt.DeliveryStatus, receipt.CheckedAt)
	}
	if receipt.ReviewDecision != "approved" || receipt.ChecksStatus != "passing" || receipt.MergeState != "clean" {
		t.Fatalf("delivery readiness = review %q checks %q merge %q", receipt.ReviewDecision, receipt.ChecksStatus, receipt.MergeState)
	}
}

func TestCreateProjectTaskPullRequestUsesRepoReceiptForNoDiffBranch(t *testing.T) {
	oldRunGit := projectTaskRunGit
	oldRunGH := projectTaskRunGH
	t.Cleanup(func() {
		projectTaskRunGit = oldRunGit
		projectTaskRunGH = oldRunGH
	})

	projectTaskRunGit = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "push -u origin laf-office-task-1":
			return []byte("pushed\n"), nil
		case "symbolic-ref --short refs/remotes/origin/HEAD":
			return []byte("origin/main\n"), nil
		case "diff --quiet origin/main...HEAD":
			return nil, nil
		case "config --get remote.origin.url":
			return []byte("git@github.com:LAF-labs/customer-portal.git\n"), nil
		default:
			t.Fatalf("unexpected git call: %v", args)
			return nil, nil
		}
	}
	projectTaskRunGH = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "pr create --title Connect repo --body Task: #task-1\n\nCreated by LAF-Office project task delivery. --head laf-office-task-1 --base main":
			return nil, errors.New("gh not available")
		case "pr view --head laf-office-task-1 --json url --jq .url":
			return nil, errors.New("no pull request")
		default:
			t.Fatalf("unexpected gh call: %v", args)
			return nil, nil
		}
	}

	receipt, err := createProjectTaskPullRequest(context.Background(), projectTaskDeliverySnapshot{
		Task: teamTask{
			ID:             "task-1",
			Title:          "Connect repo",
			WorktreePath:   "/tmp/customer-portal-task-1",
			WorktreeBranch: "laf-office-task-1",
		},
	})
	if err != nil {
		t.Fatalf("create pull request: %v", err)
	}
	if receipt.DeliveryURL != "https://github.com/LAF-labs/customer-portal" {
		t.Fatalf("delivery url = %q", receipt.DeliveryURL)
	}
	if receipt.DeliveryStatus != "receipt" || strings.TrimSpace(receipt.CheckedAt) == "" {
		t.Fatalf("delivery receipt = %q at %q", receipt.DeliveryStatus, receipt.CheckedAt)
	}
	if !strings.Contains(receipt.DeliverySummary, "No code diff") {
		t.Fatalf("delivery summary = %q", receipt.DeliverySummary)
	}
}

func TestVerifyProjectTaskRepoReceiptRequiresNoDiff(t *testing.T) {
	oldRunGit := projectTaskRunGit
	oldRunGH := projectTaskRunGH
	t.Cleanup(func() {
		projectTaskRunGit = oldRunGit
		projectTaskRunGH = oldRunGH
	})
	noDiff := true
	projectTaskRunGit = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "symbolic-ref --short refs/remotes/origin/HEAD":
			return []byte("origin/main\n"), nil
		case "diff --quiet origin/main...HEAD":
			if noDiff {
				return nil, nil
			}
			return nil, errors.New("exit status 1")
		default:
			t.Fatalf("unexpected git call: %v", args)
			return nil, nil
		}
	}
	projectTaskRunGH = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		t.Fatalf("repo receipt verification should not run gh: %v", args)
		return nil, nil
	}

	verification, err := verifyProjectTaskDeliveryURL(
		context.Background(),
		"git@github.com:LAF-labs/customer-portal.git",
		"/tmp/customer-portal-task-1",
		"https://github.com/LAF-labs/customer-portal",
	)
	if err != nil {
		t.Fatalf("verify no-diff repo receipt: %v", err)
	}
	if verification.Status != "receipt" {
		t.Fatalf("status = %q, want receipt", verification.Status)
	}

	noDiff = false
	_, err = verifyProjectTaskDeliveryURL(
		context.Background(),
		"git@github.com:LAF-labs/customer-portal.git",
		"/tmp/customer-portal-task-1",
		"https://github.com/LAF-labs/customer-portal",
	)
	if err == nil || !strings.Contains(err.Error(), "requires a no-diff branch") {
		t.Fatalf("expected no-diff error, got %v", err)
	}
}

func TestCreateProjectTaskPullRequestUsesRepoReceiptWhenBranchHasNoDiff(t *testing.T) {
	oldRunGit := projectTaskRunGit
	oldRunGH := projectTaskRunGH
	t.Cleanup(func() {
		projectTaskRunGit = oldRunGit
		projectTaskRunGH = oldRunGH
	})

	var gitCalls []string
	projectTaskRunGit = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		call := strings.Join(args, " ")
		gitCalls = append(gitCalls, call)
		switch call {
		case "push -u origin laf-office-task-1":
			return []byte("pushed\n"), nil
		case "symbolic-ref --short refs/remotes/origin/HEAD":
			return []byte("origin/main\n"), nil
		case "diff --quiet origin/main...HEAD":
			return []byte{}, nil
		case "config --get remote.origin.url":
			return []byte("git@github.com:LAF-labs/customer-portal.git\n"), nil
		default:
			t.Fatalf("unexpected git call: %v", args)
			return nil, nil
		}
	}
	projectTaskRunGH = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "pr create --title Sync runtime state --body Task: #task-1\n\nCreated by LAF-Office project task delivery. --head laf-office-task-1 --base main":
			return nil, errors.New("no commits between main and laf-office-task-1")
		case "pr view --head laf-office-task-1 --json url --jq .url":
			return nil, errors.New("no pull requests found")
		default:
			t.Fatalf("unexpected gh call: %v", args)
			return nil, nil
		}
	}

	receipt, err := createProjectTaskPullRequest(context.Background(), projectTaskDeliverySnapshot{
		Task: teamTask{
			ID:             "task-1",
			Title:          "Sync runtime state",
			WorktreePath:   "/tmp/customer-portal-task-1",
			WorktreeBranch: "laf-office-task-1",
		},
	})
	if err != nil {
		t.Fatalf("create no-diff receipt: %v", err)
	}
	if receipt.DeliveryURL != "https://github.com/LAF-labs/customer-portal" {
		t.Fatalf("delivery url = %q", receipt.DeliveryURL)
	}
	if receipt.DeliveryStatus != "receipt" || strings.TrimSpace(receipt.CheckedAt) == "" {
		t.Fatalf("delivery status = %q at %q", receipt.DeliveryStatus, receipt.CheckedAt)
	}
	if !strings.Contains(receipt.DeliverySummary, "No code diff for Sync runtime state") {
		t.Fatalf("delivery summary = %q", receipt.DeliverySummary)
	}
	if strings.Join(gitCalls, "\n") != "push -u origin laf-office-task-1\nsymbolic-ref --short refs/remotes/origin/HEAD\ndiff --quiet origin/main...HEAD\nconfig --get remote.origin.url" {
		t.Fatalf("unexpected git calls: %v", gitCalls)
	}
}

func TestVerifyProjectTaskDeliveryURLAcceptsRepoReceiptOnlyForNoDiff(t *testing.T) {
	oldRunGit := projectTaskRunGit
	oldRunGH := projectTaskRunGH
	t.Cleanup(func() {
		projectTaskRunGit = oldRunGit
		projectTaskRunGH = oldRunGH
	})
	projectTaskRunGH = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		t.Fatalf("repo receipt verification should not call gh: %v", args)
		return nil, nil
	}

	var branchHasDiff bool
	projectTaskRunGit = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "symbolic-ref --short refs/remotes/origin/HEAD":
			return []byte("origin/main\n"), nil
		case "diff --quiet origin/main...HEAD":
			if branchHasDiff {
				return nil, errors.New("branch has diff")
			}
			return []byte{}, nil
		default:
			t.Fatalf("unexpected git call: %v", args)
			return nil, nil
		}
	}

	verification, err := verifyProjectTaskDeliveryURL(context.Background(), "git@github.com:LAF-labs/customer-portal.git", "/tmp/customer-portal-task-1", "https://github.com/LAF-labs/customer-portal")
	if err != nil {
		t.Fatalf("verify no-diff repo receipt: %v", err)
	}
	if verification.Status != "receipt" {
		t.Fatalf("status = %q, want receipt", verification.Status)
	}

	branchHasDiff = true
	_, err = verifyProjectTaskDeliveryURL(context.Background(), "git@github.com:LAF-labs/customer-portal.git", "/tmp/customer-portal-task-1", "https://github.com/LAF-labs/customer-portal")
	if err == nil || !strings.Contains(err.Error(), "no-diff branch") {
		t.Fatalf("expected no-diff branch error, got %v", err)
	}
}

func TestParseGitHubPullRequestURL(t *testing.T) {
	ref, ok := parseGitHubPullRequestURL("https://github.com/LAF-labs/customer-portal/pull/42")
	if !ok {
		t.Fatal("expected GitHub PR URL to parse")
	}
	if ref.Owner != "LAF-labs" || ref.Repo != "customer-portal" || ref.Number != "42" {
		t.Fatalf("unexpected PR ref: %+v", ref)
	}
	if _, ok := parseGitHubPullRequestURL("https://github.com/LAF-labs/customer-portal/issues/42"); ok {
		t.Fatal("expected non-PR URL to be rejected")
	}
	if _, ok := parseGitHubPullRequestURL("http://github.com/LAF-labs/customer-portal/pull/42"); ok {
		t.Fatal("expected non-HTTPS PR URL to be rejected")
	}
}

func TestNormalizeProjectTaskChecksStatus(t *testing.T) {
	cases := []struct {
		name   string
		rollup []map[string]any
		want   string
	}{
		{name: "none", want: "none"},
		{name: "passing", rollup: []map[string]any{{"state": "SUCCESS"}}, want: "passing"},
		{name: "pending", rollup: []map[string]any{{"status": "IN_PROGRESS"}}, want: "pending"},
		{name: "failing", rollup: []map[string]any{{"conclusion": "FAILURE"}}, want: "failing"},
		{name: "empty entry", rollup: []map[string]any{{}}, want: "unknown"},
		{name: "unknown", rollup: []map[string]any{{"state": "SOMETHING_NEW"}}, want: "unknown"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeProjectTaskChecksStatus(tc.rollup); got != tc.want {
				t.Fatalf("checks status = %q, want %q", got, tc.want)
			}
		})
	}
}
