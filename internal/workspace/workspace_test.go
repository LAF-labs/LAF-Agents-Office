package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// seedWorkspace builds a realistic ~/.laf-office tree under dir and returns the
// map of human-readable labels to absolute paths so tests can assert on
// specific entries without recomputing paths.
func seedWorkspace(t *testing.T, dir string) map[string]string {
	t.Helper()
	base := filepath.Join(dir, ".laf-office")
	paths := map[string]string{
		"onboarded":           filepath.Join(base, "onboarded.json"),
		"company":             filepath.Join(base, "company.json"),
		"brokerState":         filepath.Join(base, "team", "broker-state.json"),
		"brokerStateSnapshot": filepath.Join(base, "team", "broker-state.json.last-good"),
		"officePID":           filepath.Join(base, "team", "office.pid"),
		"officeTasks":         filepath.Join(base, "office", "tasks", "t-1.json"),
		"workflow":            filepath.Join(base, "workflows", "wf-1.json"),
		"logs":                filepath.Join(base, "logs", "channel-stderr.log"),
		"session":             filepath.Join(base, "sessions", "s-1.json"),
		"worktree":            filepath.Join(base, "task-worktrees", "wt-1", "file"),
		"codex":               filepath.Join(base, "codex-headless", "cache"),
		"providers":           filepath.Join(base, "providers", "claude-sessions.json"),
		"openclaw":            filepath.Join(base, "openclaw", "identity.json"),
		"config":              filepath.Join(base, "config.json"),
		"calendar":            filepath.Join(base, "calendar.json"),
		"wiki":                filepath.Join(base, "wiki", "team", "playbooks", "starter.md"),
		"wikiBackup":          filepath.Join(base, "wiki.bak", "team", "playbooks", "starter.md"),
	}
	for _, p := range paths {
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", p, err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatalf("write %s: %v", p, err)
		}
	}
	return paths
}

// withRuntimeHome isolates Shred/ClearRuntime from the real home directory by
// pointing LAF_OFFICE_RUNTIME_HOME at a t.TempDir().
func withRuntimeHome(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", dir)
	return dir
}

func assertGone(t *testing.T, label, path string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected %s (%s) removed, got err=%v", label, path, err)
	}
}

func assertStays(t *testing.T, label, path string) {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected %s (%s) preserved, got err=%v", label, path, err)
	}
}

func TestClearRuntimeRemovesBrokerStateOnly(t *testing.T) {
	dir := withRuntimeHome(t)
	paths := seedWorkspace(t, dir)

	res, err := ClearRuntime()
	if err != nil {
		t.Fatalf("ClearRuntime: %v", err)
	}
	if len(res.Errors) != 0 {
		t.Fatalf("unexpected errors: %v", res.Errors)
	}

	assertGone(t, "brokerState", paths["brokerState"])
	assertGone(t, "brokerStateSnapshot", paths["brokerStateSnapshot"])

	// Everything else survives a narrow reset.
	for _, label := range []string{
		"onboarded", "company", "officeTasks", "workflow",
		"logs", "session", "worktree", "codex", "providers",
		"officePID", "openclaw", "config", "calendar",
	} {
		assertStays(t, label, paths[label])
	}
}

func TestClearRuntimeRejectsBrokerStatePathOutsideRuntimeHome(t *testing.T) {
	withRuntimeHome(t)
	outside := filepath.Join(t.TempDir(), "broker-state.json")
	if err := os.WriteFile(outside, []byte("keep"), 0o600); err != nil {
		t.Fatalf("write outside broker state: %v", err)
	}
	t.Setenv("LAF_OFFICE_BROKER_STATE_PATH", outside)

	_, err := ClearRuntime()
	if err == nil {
		t.Fatal("expected ClearRuntime to reject an outside broker state path")
	}
	if !strings.Contains(err.Error(), "outside runtime home") {
		t.Fatalf("unexpected error: %v", err)
	}
	assertStays(t, "outside broker state", outside)
}

func TestClearRuntimeAllowsConfiguredBrokerStatePathUnderRuntimeHome(t *testing.T) {
	dir := withRuntimeHome(t)
	statePath := filepath.Join(dir, ".laf-office", "custom", "broker-state.json")
	snapshotPath := statePath + ".last-good"
	for _, path := range []string{statePath, snapshotPath} {
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
		if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}
	t.Setenv("LAF_OFFICE_BROKER_STATE_PATH", statePath)

	res, err := ClearRuntime()
	if err != nil {
		t.Fatalf("ClearRuntime: %v", err)
	}
	if len(res.Errors) != 0 {
		t.Fatalf("unexpected errors: %v", res.Errors)
	}
	if len(res.Removed) != 2 {
		t.Fatalf("expected state and snapshot removed, got %v", res.Removed)
	}
	assertGone(t, "configured broker state", statePath)
	assertGone(t, "configured broker state snapshot", snapshotPath)
}

func TestClearRuntimeRefusesBrokerStateDirectory(t *testing.T) {
	dir := withRuntimeHome(t)
	statePath := filepath.Join(dir, ".laf-office", "team", "broker-state.json")
	nestedPath := filepath.Join(statePath, "nested.txt")
	if err := os.MkdirAll(filepath.Dir(nestedPath), 0o700); err != nil {
		t.Fatalf("mkdir broker state directory: %v", err)
	}
	if err := os.WriteFile(nestedPath, []byte("keep"), 0o600); err != nil {
		t.Fatalf("write nested broker state file: %v", err)
	}

	res, err := ClearRuntime()
	if err != nil {
		t.Fatalf("ClearRuntime: %v", err)
	}
	if len(res.Removed) != 0 {
		t.Fatalf("expected no removals, got %v", res.Removed)
	}
	if len(res.Errors) != 1 || !strings.Contains(res.Errors[0], "refusing to remove directory") {
		t.Fatalf("expected directory refusal, got %+v", res)
	}
	assertStays(t, "broker state directory", statePath)
	assertStays(t, "nested broker state file", nestedPath)
}

func TestShredRemovesWorkspaceHistoryButPreservesUserWorkAndConfig(t *testing.T) {
	dir := withRuntimeHome(t)
	paths := seedWorkspace(t, dir)

	res, err := Shred()
	if err != nil {
		t.Fatalf("Shred: %v", err)
	}
	if len(res.Errors) != 0 {
		t.Fatalf("unexpected errors: %v", res.Errors)
	}

	// Wiped by shred.
	for _, label := range []string{
		"onboarded", "company", "brokerState", "brokerStateSnapshot",
		"officeTasks", "workflow", "logs", "session", "codex",
		"providers", "calendar", "wiki", "wikiBackup",
	} {
		assertGone(t, label, paths[label])
	}

	// Preserved: in-flight work and user credentials/preferences.
	for _, label := range []string{
		"officePID", "worktree", "openclaw", "config",
	} {
		assertStays(t, label, paths[label])
	}
}

func TestShredIsIdempotent(t *testing.T) {
	withRuntimeHome(t)
	// No seed — directory is empty. Shred must not error on missing paths.
	res, err := Shred()
	if err != nil {
		t.Fatalf("first Shred on empty home: %v", err)
	}
	if len(res.Removed) != 0 {
		t.Fatalf("expected no removals on empty home, got %v", res.Removed)
	}
	if len(res.Errors) != 0 {
		t.Fatalf("unexpected errors: %v", res.Errors)
	}

	// Second call is still fine.
	if _, err := Shred(); err != nil {
		t.Fatalf("second Shred: %v", err)
	}
}

func TestClearRuntimeWithNoTeamDirIsNoOp(t *testing.T) {
	withRuntimeHome(t)
	res, err := ClearRuntime()
	if err != nil {
		t.Fatalf("ClearRuntime: %v", err)
	}
	if len(res.Removed) != 0 || len(res.Errors) != 0 {
		t.Fatalf("expected empty result, got %+v", res)
	}
}
