package setup

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestInstallLatestCLI(t *testing.T) {
	dir := t.TempDir()
	logFile := filepath.Join(dir, "args.log")
	npmBin := "npm"
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > " + shellQuote(logFile) + "\n"
	if runtime.GOOS == "windows" {
		npmBin = "npm.cmd"
		script = "@echo off\r\n> \"" + logFile + "\" echo %*\r\n"
	}
	if err := os.WriteFile(filepath.Join(dir, npmBin), []byte(script), 0o755); err != nil {
		t.Fatalf("write fake npm: %v", err)
	}

	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("LAF_OFFICE_CLI_INSTALL_BIN", npmBin)
	t.Setenv("LAF_OFFICE_CLI_PACKAGE", "@example/laf-office")

	notice, err := InstallLatestCLI()
	if err != nil {
		t.Fatalf("InstallLatestCLI returned error: %v", err)
	}
	if !strings.Contains(notice, "@example/laf-office") {
		t.Fatalf("expected package name in notice, got %q", notice)
	}

	data, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("read args log: %v", err)
	}
	got := strings.Fields(string(data))
	want := []string{"install", "-g", "@example/laf-office@latest"}
	if strings.Join(got, " ") != strings.Join(want, " ") {
		t.Fatalf("expected args %v, got %v", want, got)
	}
}

func TestInstallLatestCLIReturnsHelpfulFailure(t *testing.T) {
	dir := t.TempDir()
	npmBin := "npm"
	script := "#!/bin/sh\necho boom >&2\nexit 1\n"
	if runtime.GOOS == "windows" {
		npmBin = "npm.cmd"
		script = "@echo off\r\necho boom 1>&2\r\nexit /b 1\r\n"
	}
	if err := os.WriteFile(filepath.Join(dir, npmBin), []byte(script), 0o755); err != nil {
		t.Fatalf("write fake npm: %v", err)
	}

	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("LAF_OFFICE_CLI_INSTALL_BIN", npmBin)
	t.Setenv("LAF_OFFICE_CLI_PACKAGE", "@example/laf-office")

	_, err := InstallLatestCLI()
	if err == nil {
		t.Fatal("expected install failure")
	}
	if !strings.Contains(err.Error(), "boom") {
		t.Fatalf("expected stderr in error, got %v", err)
	}
}

func shellQuote(path string) string {
	return "'" + strings.ReplaceAll(path, "'", "'\"'\"'") + "'"
}
