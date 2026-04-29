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
}
