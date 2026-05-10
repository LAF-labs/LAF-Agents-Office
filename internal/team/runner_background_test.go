package team

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRotateRunnerBackgroundLog(t *testing.T) {
	path := filepath.Join(t.TempDir(), "runner-background.log")
	content := make([]byte, runnerBackgroundLogMaxBytes+1)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatalf("write log: %v", err)
	}

	if err := rotateRunnerBackgroundLog(path); err != nil {
		t.Fatalf("rotate log: %v", err)
	}
	if _, err := os.Stat(path + ".1"); err != nil {
		t.Fatalf("rotated log missing: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("active log should be moved before reopen, err=%v", err)
	}
}
