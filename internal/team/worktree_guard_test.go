package team

import (
	"fmt"
	"os"
	"testing"
)

// The guard flips + stub installs are intentionally in a *_test.go init()
// so the `testing` import (and the stub functions) stay out of the
// production build. Production defaults in worktree.go remain:
//   - allowRealTaskWorktree = true
//   - unscopedWikiRootAllowed = true
//   - prepareTaskWorktree = defaultPrepareTaskWorktree
//   - cleanupTaskWorktree = defaultCleanupTaskWorktree
//
// Under `go test`, init() below replaces all four with safe defaults:
//   - The two guards are disabled so any test that reaches the real
//     codepath without opting in panics / errors loudly.
//   - The two vars are stubbed so indirect callers (e.g. EnsureTask →
//     syncTaskWorktreeLocked → prepareTaskWorktree on a coding-agent
//     task) get a deterministic fake path + branch instead of
//     registering a worktree against the developer's laf-office repo.
//
// Tests that legitimately need the real prepare/cleanup codepath (the
// three cases in worktree_test.go that build a tempdir-scoped repo and
// chdir into it) must opt in via allowRealTaskWorktreeForTest(t) AND
// call defaultPrepareTaskWorktree directly. Tests that want custom
// stub behavior continue to monkey-patch prepareTaskWorktree; their
// defer-restore lands on the stub below, not the real codepath.
func init() {
	allowRealTaskWorktree = false
	unscopedWikiRootAllowed = false
	prepareTaskWorktree = stubPrepareTaskWorktree
	prepareProjectTaskWorktree = stubPrepareProjectTaskWorktree
	cleanupTaskWorktree = stubCleanupTaskWorktree
	skipBrokerStateLoadOnConstruct = true

	// Pin LAF_OFFICE_RUNTIME_HOME into a process-lifetime leaked tempdir so
	// any test that constructs a Broker without its own isolation setup
	// falls back to /tmp instead of the developer's real ~/.laf-office.
	// defaultBrokerStatePath() consults this env var, so broker state
	// files created by unisolated tests land under a leaked temp dir.
	// Leaked (not t.TempDir) so late writes from goroutines a test
	// failed to stop don't race on a directory being deleted.
	runtimeHome, err := os.MkdirTemp("", "laf-office-test-runtime-home-*")
	if err != nil {
		panic(fmt.Sprintf("worktree_guard_test init: mktemp runtime home: %v", err))
	}
	if err := os.Setenv("LAF_OFFICE_RUNTIME_HOME", runtimeHome); err != nil {
		panic(fmt.Sprintf("worktree_guard_test init: setenv LAF_OFFICE_RUNTIME_HOME: %v", err))
	}
}

func stubPrepareTaskWorktree(taskID string) (string, string, error) {
	// Share stubTaskWorktreePath with DisableRealTaskWorktreeForTests so
	// both stubs emit the same `<root>/.laf-office/task-worktrees/<repoToken>/laf-office-task-<id>`
	// shape — downstream assertions on the path format stay consistent.
	path, branch := stubTaskWorktreePath(taskID)
	return path, branch, nil
}

func stubPrepareProjectTaskWorktree(_, _, taskID string) (string, string, error) {
	return stubPrepareTaskWorktree(taskID)
}

func stubCleanupTaskWorktree(string, string) error { return nil }

// allowRealTaskWorktreeForTest opts the current test into the real
// defaultPrepareTaskWorktree / defaultCleanupTaskWorktree codepath. It
// mutates three package-level globals (allowRealTaskWorktree,
// prepareTaskWorktree, cleanupTaskWorktree) without synchronization and
// restores them via t.Cleanup. Call sites MUST NOT call t.Parallel() in
// the same test, and the test MUST NOT spawn background brokers/workers
// that read those function pointers concurrently — both conditions hold
// for the three current callers in worktree_test.go (no t.Parallel, no
// Broker goroutines). If a future caller needs either, convert this to
// a mutex-guarded swap like setHeadlessWakeLeadFn in broker_test.go.
func allowRealTaskWorktreeForTest(t *testing.T) {
	t.Helper()
	prevAllow := allowRealTaskWorktree
	prevPrepare := prepareTaskWorktree
	prevProjectPrepare := prepareProjectTaskWorktree
	prevCleanup := cleanupTaskWorktree
	allowRealTaskWorktree = true
	prepareTaskWorktree = defaultPrepareTaskWorktree
	prepareProjectTaskWorktree = defaultPrepareProjectTaskWorktree
	cleanupTaskWorktree = defaultCleanupTaskWorktree
	t.Cleanup(func() {
		allowRealTaskWorktree = prevAllow
		prepareTaskWorktree = prevPrepare
		prepareProjectTaskWorktree = prevProjectPrepare
		cleanupTaskWorktree = prevCleanup
	})
}
