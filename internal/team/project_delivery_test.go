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
		case "pr view https://github.com/LAF-labs/customer-portal/pull/9 --json state --jq .state":
			return []byte("MERGED\n"), nil
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
