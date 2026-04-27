package product

import (
	"path/filepath"
	"testing"
)

func TestEnv(t *testing.T) {
	if got := Env("BROKER_TOKEN"); got != "LAF_OFFICE_BROKER_TOKEN" {
		t.Fatalf("Env: got %q", got)
	}
	if got := Env("_BROKER_TOKEN_"); got != "LAF_OFFICE_BROKER_TOKEN" {
		t.Fatalf("Env trims underscores: got %q", got)
	}
	if got := Env(""); got != EnvPrefix {
		t.Fatalf("Env empty: got %q", got)
	}
}

func TestRuntimePath(t *testing.T) {
	if got := RuntimePath("/tmp/home", "team", "broker-state.json"); got != filepath.Join("/tmp/home", ".laf-office", "team", "broker-state.json") {
		t.Fatalf("RuntimePath absolute: got %q", got)
	}
	if got := RuntimePath("", "config.json"); got != filepath.Join(".laf-office", "config.json") {
		t.Fatalf("RuntimePath relative: got %q", got)
	}
}

func TestTaskNames(t *testing.T) {
	if TaskPrefix != CLIName+"-task-" {
		t.Fatalf("TaskPrefix: got %q", TaskPrefix)
	}
	if TaskRootName != CLIName+"-task-worktrees" {
		t.Fatalf("TaskRootName: got %q", TaskRootName)
	}
}
