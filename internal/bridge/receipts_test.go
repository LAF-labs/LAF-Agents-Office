package bridge

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestCaptureChangedFilesFromGitStatus(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	dir := t.TempDir()
	runGit(t, dir, "init")
	runGit(t, dir, "config", "user.email", "test@example.com")
	runGit(t, dir, "config", "user.name", "Test")
	if err := os.WriteFile(filepath.Join(dir, "tracked.txt"), []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, "add", "tracked.txt")
	runGit(t, dir, "commit", "-m", "initial")
	if err := os.WriteFile(filepath.Join(dir, "tracked.txt"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "new.txt"), []byte("new\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := CaptureChangedFiles(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	statuses := map[string]string{}
	for _, file := range files {
		statuses[file.Path] = file.Status
	}
	if statuses["tracked.txt"] != "M" {
		t.Fatalf("tracked status: got %#v", statuses)
	}
	if statuses["new.txt"] != "??" {
		t.Fatalf("new file status: got %#v", statuses)
	}
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	all := append([]string{"-C", dir}, args...)
	cmd := exec.Command("git", all...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}
