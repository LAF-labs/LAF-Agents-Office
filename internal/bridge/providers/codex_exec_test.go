package providers

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type codexRecord struct {
	Args  []string `json:"args"`
	Dir   string   `json:"dir"`
	Stdin string   `json:"stdin"`
}

func TestCodexExecDetectsVersion(t *testing.T) {
	recordFile := filepath.Join(t.TempDir(), "record.jsonl")
	adapter := testCodexAdapter(t, recordFile, "version")
	detected := adapter.Detect(context.Background())
	if !detected.Detected {
		t.Fatalf("expected detected codex: %#v", detected)
	}
	if detected.Version != "codex 1.2.3" {
		t.Fatalf("version: got %q", detected.Version)
	}
}

func TestCodexExecRunParsesJSONLAndChangedFiles(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	recordFile := filepath.Join(t.TempDir(), "record.jsonl")
	workdir := t.TempDir()
	initGitRepo(t, workdir)
	adapter := testCodexAdapter(t, recordFile, "success")

	result, err := adapter.Run(context.Background(), workdir, "Ship with Bearer abcdef01234567890")
	if err != nil {
		t.Fatal(err)
	}
	if result.Summary != "codex final answer" {
		t.Fatalf("summary: got %q", result.Summary)
	}
	if len(result.Events) == 0 {
		t.Fatal("expected normalized events")
	}
	if result.Events[0].Type != "codex.tool_use" {
		t.Fatalf("first event: %#v", result.Events[0])
	}
	if strings.Contains(result.Events[0].Payload["tool_input"].(string), "abcdef01234567890") {
		t.Fatalf("event payload leaked secret: %#v", result.Events[0].Payload)
	}
	if len(result.ChangedFiles) != 1 || result.ChangedFiles[0].Path != "changed.txt" {
		t.Fatalf("changed files: %#v", result.ChangedFiles)
	}
	if result.Usage["input_tokens"] != 12 || result.Usage["output_tokens"] != 5 {
		t.Fatalf("usage: %#v", result.Usage)
	}

	records := readCodexRecords(t, recordFile)
	if len(records) != 1 {
		t.Fatalf("records: %#v", records)
	}
	if !containsArg(records[0].Args, "--json") || !containsArg(records[0].Args, "--sandbox") {
		t.Fatalf("codex args missing json/sandbox: %#v", records[0].Args)
	}
	if !strings.Contains(records[0].Stdin, "Ship with Bearer") {
		t.Fatalf("prompt was not sent on stdin: %q", records[0].Stdin)
	}
}

func TestCodexExecCancellationTerminatesProcess(t *testing.T) {
	recordFile := filepath.Join(t.TempDir(), "record.jsonl")
	workdir := t.TempDir()
	adapter := testCodexAdapter(t, recordFile, "sleep")
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_, err := adapter.Run(ctx, workdir, "stop soon")
	if err == nil {
		t.Fatal("expected cancellation error")
	}
	if !strings.Contains(err.Error(), "deadline") && !strings.Contains(err.Error(), "killed") {
		t.Fatalf("unexpected cancellation error: %v", err)
	}
}

func testCodexAdapter(t *testing.T, recordFile string, scenario string) CodexExec {
	t.Helper()
	t.Setenv("GO_WANT_BRIDGE_CODEX_HELPER", "1")
	t.Setenv("BRIDGE_CODEX_RECORD_FILE", recordFile)
	t.Setenv("BRIDGE_CODEX_SCENARIO", scenario)
	return CodexExec{
		LookPath: func(file string) (string, error) {
			if file != "codex" {
				t.Fatalf("unexpected lookup: %s", file)
			}
			return os.Args[0], nil
		},
		CommandContext: func(ctx context.Context, _ string, args ...string) *exec.Cmd {
			cmdArgs := []string{"-test.run=TestBridgeCodexHelperProcess", "--"}
			cmdArgs = append(cmdArgs, args...)
			cmd := exec.CommandContext(ctx, os.Args[0], cmdArgs...)
			cmd.Env = append(os.Environ(),
				"GO_WANT_BRIDGE_CODEX_HELPER=1",
				"BRIDGE_CODEX_RECORD_FILE="+recordFile,
				"BRIDGE_CODEX_SCENARIO="+scenario,
			)
			return cmd
		},
	}
}

func TestBridgeCodexHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_BRIDGE_CODEX_HELPER") != "1" {
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
	codexArgs := append([]string(nil), args[doubleDash+1:]...)
	if len(codexArgs) == 1 && codexArgs[0] == "--version" {
		_, _ = os.Stdout.WriteString("codex 1.2.3\n")
		os.Exit(0)
	}
	stdin, _ := io.ReadAll(os.Stdin)
	record := codexRecord{Args: codexArgs, Dir: mustGetwd(), Stdin: string(stdin)}
	appendRecord(record)
	switch os.Getenv("BRIDGE_CODEX_SCENARIO") {
	case "success":
		_ = os.WriteFile("changed.txt", []byte("changed\n"), 0o644)
		_, _ = os.Stdout.WriteString("{\"type\":\"response.output_item.added\",\"item\":{\"id\":\"tool-1\",\"type\":\"function_call\",\"name\":\"shell\",\"arguments\":\"{\\\"cmd\\\":\\\"echo Bearer abcdef01234567890\\\"}\"}}\n")
		_, _ = os.Stdout.WriteString("{\"type\":\"response.output_item.done\",\"item\":{\"id\":\"tool-1\",\"type\":\"function_call\",\"name\":\"shell\",\"arguments\":\"{\\\"cmd\\\":\\\"echo Bearer abcdef01234567890\\\"}\"}}\n")
		_, _ = os.Stdout.WriteString("{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"codex final answer\"}}\n")
		_, _ = os.Stdout.WriteString("{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":12,\"cached_input_tokens\":3,\"output_tokens\":5}}\n")
		os.Exit(0)
	case "sleep":
		time.Sleep(5 * time.Second)
		os.Exit(0)
	default:
		t.Fatalf("unknown scenario: %s", os.Getenv("BRIDGE_CODEX_SCENARIO"))
	}
}

func appendRecord(record codexRecord) {
	raw, _ := json.Marshal(record)
	f, err := os.OpenFile(os.Getenv("BRIDGE_CODEX_RECORD_FILE"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	_, _ = f.Write(append(raw, '\n'))
}

func readCodexRecords(t *testing.T, path string) []codexRecord {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var records []codexRecord
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		var record codexRecord
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatal(err)
		}
		records = append(records, record)
	}
	return records
}

func initGitRepo(t *testing.T, dir string) {
	t.Helper()
	runGit(t, dir, "init")
	runGit(t, dir, "config", "user.email", "test@example.com")
	runGit(t, dir, "config", "user.name", "Test")
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("base\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, "add", "README.md")
	runGit(t, dir, "commit", "-m", "initial")
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	all := append([]string{"-C", dir}, args...)
	cmd := exec.Command("git", all...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func containsArg(args []string, want string) bool {
	for _, arg := range args {
		if arg == want {
			return true
		}
	}
	return false
}

func mustGetwd() string {
	wd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	return wd
}
