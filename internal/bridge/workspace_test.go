package bridge

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type gitRecord struct {
	Args []string `json:"args"`
}

func TestWorkdirForPlanClonesAndReusesManagedProjectCheckout(t *testing.T) {
	runtimeHome := t.TempDir()
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", runtimeHome)
	recordFile := filepath.Join(t.TempDir(), "git.jsonl")
	withFakeManagedGit(t, recordFile)

	projectID := "11111111-1111-4111-8111-111111111111"
	plan := ExecutionPlan{
		ProjectID: &projectID,
		Policy: json.RawMessage(
			`{"github_repo_url":"https://github.com/LAF-labs/demo","project_slug":"Demo Project"}`,
		),
	}
	workdir, err := WorkdirForPlan(context.Background(), plan)
	if err != nil {
		t.Fatal(err)
	}
	wantPrefix := filepath.Join(
		runtimeHome,
		".laf-office",
		"bridge",
		"workspace",
		"projects",
		"demo-project-",
	)
	if !strings.HasPrefix(workdir, wantPrefix) {
		t.Fatalf("managed checkout path = %q, want prefix %q", workdir, wantPrefix)
	}
	if _, err := os.Stat(filepath.Join(workdir, ".git")); err != nil {
		t.Fatalf("fake clone did not create git worktree: %v", err)
	}

	again, err := WorkdirForPlan(context.Background(), plan)
	if err != nil {
		t.Fatal(err)
	}
	if again != workdir {
		t.Fatalf("managed checkout not reused: got %q want %q", again, workdir)
	}

	records := readGitRecords(t, recordFile)
	if !hasGitRecord(records, "clone", "--depth", "1", "https://github.com/LAF-labs/demo", workdir) {
		t.Fatalf("git clone was not recorded: %#v", records)
	}
	if !hasGitRecord(records, "-C", workdir, "remote", "get-url", "origin") {
		t.Fatalf("git remote origin check was not recorded: %#v", records)
	}
}

func TestWorkdirForPlanAcceptsLegacyProjectLocalID(t *testing.T) {
	runtimeHome := t.TempDir()
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", runtimeHome)
	recordFile := filepath.Join(t.TempDir(), "git.jsonl")
	withFakeManagedGit(t, recordFile)

	projectID := "11111111-1111-4111-8111-111111111111"
	plan := ExecutionPlan{
		ProjectID: &projectID,
		Policy: json.RawMessage(
			`{"github_repo_url":"https://github.com/LAF-labs/demo","project_local_id":"Legacy Project"}`,
		),
	}
	workdir, err := WorkdirForPlan(context.Background(), plan)
	if err != nil {
		t.Fatal(err)
	}
	wantPrefix := filepath.Join(
		runtimeHome,
		".laf-office",
		"bridge",
		"workspace",
		"projects",
		"legacy-project-",
	)
	if !strings.HasPrefix(workdir, wantPrefix) {
		t.Fatalf("legacy managed checkout path = %q, want prefix %q", workdir, wantPrefix)
	}
}

func TestWorkdirForPlanRejectsNonGitHubManagedRepoURL(t *testing.T) {
	projectID := "11111111-1111-4111-8111-111111111111"
	_, err := WorkdirForPlan(context.Background(), ExecutionPlan{
		ProjectID: &projectID,
		Policy:    json.RawMessage(`{"github_repo_url":"file:///tmp/repo"}`),
	})
	if err == nil {
		t.Fatal("expected invalid managed repo URL error")
	}
	if !strings.Contains(err.Error(), "GitHub HTTPS URL") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func withFakeManagedGit(t *testing.T, recordFile string) {
	t.Helper()
	old := managedCheckoutGitCommand
	managedCheckoutGitCommand = func(ctx context.Context, _ string, args ...string) *exec.Cmd {
		cmdArgs := []string{"-test.run=TestBridgeManagedGitHelperProcess", "--"}
		cmdArgs = append(cmdArgs, args...)
		cmd := exec.CommandContext(ctx, os.Args[0], cmdArgs...)
		cmd.Env = append(os.Environ(),
			"GO_WANT_BRIDGE_MANAGED_GIT_HELPER=1",
			"BRIDGE_GIT_RECORD_FILE="+recordFile,
		)
		return cmd
	}
	t.Cleanup(func() {
		managedCheckoutGitCommand = old
	})
}

func TestBridgeManagedGitHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_BRIDGE_MANAGED_GIT_HELPER") != "1" {
		return
	}
	args := os.Args
	doubleDash := 0
	for i, arg := range args {
		if arg == "--" {
			doubleDash = i
			break
		}
	}
	gitArgs := append([]string(nil), args[doubleDash+1:]...)
	appendGitRecord(gitRecord{Args: gitArgs})
	if len(gitArgs) >= 5 &&
		gitArgs[0] == "clone" &&
		gitArgs[1] == "--depth" &&
		gitArgs[2] == "1" {
		repoURL := gitArgs[3]
		checkoutPath := gitArgs[4]
		must(os.MkdirAll(filepath.Join(checkoutPath, ".git"), 0o700))
		must(os.WriteFile(filepath.Join(checkoutPath, ".git", "origin"), []byte(repoURL+"\n"), 0o600))
		os.Exit(0)
	}
	if len(gitArgs) >= 4 && gitArgs[0] == "-C" && gitArgs[2] == "rev-parse" {
		if _, err := os.Stat(filepath.Join(gitArgs[1], ".git")); err == nil {
			_, _ = os.Stdout.WriteString("true\n")
			os.Exit(0)
		}
		os.Exit(1)
	}
	if len(gitArgs) >= 5 &&
		gitArgs[0] == "-C" &&
		gitArgs[2] == "remote" &&
		gitArgs[3] == "get-url" &&
		gitArgs[4] == "origin" {
		data, err := os.ReadFile(filepath.Join(gitArgs[1], ".git", "origin"))
		if err != nil {
			os.Exit(1)
		}
		_, _ = os.Stdout.Write(data)
		os.Exit(0)
	}
	os.Exit(1)
}

func appendGitRecord(record gitRecord) {
	raw, _ := json.Marshal(record)
	f, err := os.OpenFile(os.Getenv("BRIDGE_GIT_RECORD_FILE"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	_, _ = f.Write(append(raw, '\n'))
}

func readGitRecords(t *testing.T, path string) []gitRecord {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var records []gitRecord
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var record gitRecord
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatal(err)
		}
		records = append(records, record)
	}
	return records
}

func hasGitRecord(records []gitRecord, args ...string) bool {
	for _, record := range records {
		if len(record.Args) != len(args) {
			continue
		}
		matches := true
		for i := range args {
			if record.Args[i] != args[i] {
				matches = false
				break
			}
		}
		if matches {
			return true
		}
	}
	return false
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
