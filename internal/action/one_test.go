package action

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
)

func writeFakeOne(t *testing.T) string {
	t.Helper()
	installFakeOneCommand(t)
	return "one-test-bin"
}

func installFakeOneCommand(t *testing.T) {
	t.Helper()
	t.Setenv("LAF_OFFICE_TEST_ONE_HELPER", "1")
	oldCommandContext := oneCLICommandContext
	oneCLICommandContext = func(ctx context.Context, _ string, args ...string) *exec.Cmd {
		cmdArgs := append([]string{"-test.run=TestOneCLIHelperProcess", "--"}, args...)
		return exec.CommandContext(ctx, os.Args[0], cmdArgs...)
	}
	t.Cleanup(func() {
		oneCLICommandContext = oldCommandContext
	})
}

func installOneLookPath(t *testing.T, available map[string]bool) {
	t.Helper()
	oldLookPath := oneCLILookPath
	oneCLILookPath = func(name string) (string, error) {
		if available[name] {
			return name, nil
		}
		return "", exec.ErrNotFound
	}
	t.Cleanup(func() {
		oneCLILookPath = oldLookPath
	})
}

func TestOneCLIHelperProcess(t *testing.T) {
	if os.Getenv("LAF_OFFICE_TEST_ONE_HELPER") != "1" {
		return
	}
	os.Exit(fakeOneMain())
}

func fakeOneMain() int {
	args := os.Args
	for i, arg := range args {
		if arg == "--" {
			args = args[i+1:]
			break
		}
	}
	if len(args) >= 2 && args[0] == "-y" && args[1] == "@withone/cli" {
		args = args[2:]
	}
	if len(args) > 0 && args[0] == "--agent" {
		args = args[1:]
	}
	if traceFile := os.Getenv("LAF_OFFICE_TEST_ONE_TRACE_PWD"); traceFile != "" {
		wd, err := os.Getwd()
		if err != nil {
			fmt.Fprintf(os.Stderr, "get cwd: %v\n", err)
			return 1
		}
		if err := os.WriteFile(traceFile, []byte(wd+"\n"), 0o600); err != nil {
			fmt.Fprintf(os.Stderr, "write cwd trace: %v\n", err)
			return 1
		}
	}

	switch {
	case len(args) >= 1 && args[0] == "list":
		fmt.Println(`{"total":1,"showing":1,"connections":[{"platform":"gmail","state":"operational","key":"live::gmail::default::abc123"}]}`)
	case len(args) >= 3 && args[0] == "actions" && args[1] == "search" && args[2] == "gmail":
		fmt.Println(`{"actions":[{"actionId":"act-send","title":"Send Email","method":"POST","path":"/gmail/send"}]}`)
	case len(args) >= 3 && args[0] == "actions" && args[1] == "knowledge" && args[2] == "gmail":
		fmt.Println(`{"knowledge":"Needs to, subject, body","method":"POST"}`)
	case len(args) >= 3 && args[0] == "actions" && args[1] == "execute" && args[2] == "gmail":
		fmt.Println(`{"dryRun":true,"request":{"method":"POST","url":"https://api.withone.ai/send","headers":{"x-test":"1"},"data":{"to":"a@example.com"}}}`)
	case len(args) >= 3 && args[0] == "flow" && args[1] == "create":
		fmt.Printf(`{"created":true,"key":%q,"path":%q}`+"\n", args[2], "/tmp/.one/flows/"+args[2]+"/flow.json")
	case len(args) >= 2 && args[0] == "flow" && args[1] == "execute":
		fmt.Println(`{"event":"step:start","stepId":"execute"}`)
		fmt.Println(`{"event":"workflow:result","runId":"run-1","logFile":"/tmp/run.log","status":"success","steps":{"execute":{"status":"success","response":{"ok":true,"posted":true,"channel":"#ops"}}}}`)
	case len(args) >= 3 && args[0] == "relay" && args[1] == "event-types" && args[2] == "gmail":
		fmt.Println(`{"platform":"gmail","eventTypes":["message.received"]}`)
	case len(args) >= 2 && args[0] == "relay" && args[1] == "create":
		fmt.Println(`{"id":"relay-1","url":"https://relay.example","active":false,"description":"mail relay","eventFilters":["message.received"]}`)
	case len(args) >= 3 && args[0] == "relay" && args[1] == "activate" && args[2] == "relay-1":
		fmt.Println(`{"id":"relay-1","active":true,"actions":[{"type":"passthrough"}]}`)
	case len(args) >= 2 && args[0] == "relay" && args[1] == "events":
		fmt.Println(`{"total":1,"showing":1,"events":[{"id":"evt-1","platform":"gmail","eventType":"message.received","timestamp":"2026-03-29T10:00:00Z"}]}`)
	case len(args) >= 3 && args[0] == "relay" && args[1] == "event" && args[2] == "evt-1":
		fmt.Println(`{"id":"evt-1","platform":"gmail","eventType":"message.received","timestamp":"2026-03-29T10:00:00Z","payload":{"from":"a@example.com"}}`)
	default:
		fmt.Fprintf(os.Stderr, "unexpected args: %s\n", strings.Join(args, " "))
		return 1
	}
	return 0
}

func TestOneCLIHappyPath(t *testing.T) {
	oneBin := writeFakeOne(t)
	client := &OneCLI{Bin: oneBin, WorkDir: t.TempDir(), Env: []string{"ONE_SECRET=test-secret"}}
	ctx := context.Background()

	connections, err := client.ListConnections(ctx, ListConnectionsOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if got := len(connections.Connections); got != 1 {
		t.Fatalf("expected 1 connection, got %d", got)
	}

	search, err := client.SearchActions(ctx, "gmail", "send email", "execute")
	if err != nil {
		t.Fatal(err)
	}
	if got := search.Actions[0].ActionID; got != "act-send" {
		t.Fatalf("unexpected action id %q", got)
	}

	knowledge, err := client.ActionKnowledge(ctx, "gmail", "act-send")
	if err != nil {
		t.Fatal(err)
	}
	if knowledge.Method != "POST" {
		t.Fatalf("unexpected method %q", knowledge.Method)
	}

	executed, err := client.ExecuteAction(ctx, ExecuteRequest{
		Platform:      "gmail",
		ActionID:      "act-send",
		ConnectionKey: "live::gmail::default::abc123",
		Data: map[string]any{
			"to": "a@example.com",
		},
		DryRun: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !executed.DryRun || executed.Request.Method != "POST" {
		t.Fatalf("unexpected execute result %+v", executed)
	}

	created, err := client.CreateWorkflow(ctx, WorkflowCreateRequest{
		Key:        "welcome-flow",
		Definition: []byte(`{"key":"welcome-flow","name":"Welcome","version":"1","inputs":{},"steps":[]}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !created.Created {
		t.Fatalf("expected created workflow, got %+v", created)
	}

	workflow, err := client.ExecuteWorkflow(ctx, WorkflowExecuteRequest{KeyOrPath: "welcome-flow"})
	if err != nil {
		t.Fatal(err)
	}
	if workflow.RunID != "run-1" || workflow.Status != "success" {
		t.Fatalf("unexpected workflow result %+v", workflow)
	}

	eventTypes, err := client.RelayEventTypes(ctx, "gmail")
	if err != nil {
		t.Fatal(err)
	}
	if len(eventTypes.EventTypes) != 1 {
		t.Fatalf("unexpected event types %+v", eventTypes)
	}

	relay, err := client.CreateRelay(ctx, RelayCreateRequest{
		ConnectionKey: "live::gmail::default::abc123",
		Description:   "mail relay",
		EventFilters:  []string{"message.received"},
		CreateWebhook: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if relay.ID != "relay-1" {
		t.Fatalf("unexpected relay %+v", relay)
	}

	relay, err = client.ActivateRelay(ctx, RelayActivateRequest{
		ID:      "relay-1",
		Actions: []byte(`[{"type":"passthrough"}]`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if !relay.Active {
		t.Fatalf("expected active relay, got %+v", relay)
	}

	events, err := client.ListRelayEvents(ctx, RelayEventsOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if got := len(events.Events); got != 1 {
		t.Fatalf("expected 1 relay event, got %d", got)
	}

	detail, err := client.GetRelayEvent(ctx, "evt-1")
	if err != nil {
		t.Fatal(err)
	}
	if detail.ID != "evt-1" {
		t.Fatalf("unexpected relay detail %+v", detail)
	}
}

func TestNewOneCLIFromEnvUsesManagedIdentity(t *testing.T) {
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", t.TempDir())
	if err := config.Save(config.Config{
		APIKey:    "office-key",
		OneAPIKey: "one-secret",
		Email:     "ceo@example.com",
	}); err != nil {
		t.Fatalf("save config: %v", err)
	}

	client := NewOneCLIFromEnv()
	got := strings.Join(client.Env, " ")
	if !strings.Contains(got, "ONE_SECRET=one-secret") {
		t.Fatalf("expected ONE_SECRET env, got %q", got)
	}
	if !strings.Contains(got, "ONE_IDENTITY=ceo@example.com") {
		t.Fatalf("expected ONE_IDENTITY env, got %q", got)
	}
	if !strings.Contains(got, "ONE_IDENTITY_TYPE=user") {
		t.Fatalf("expected ONE_IDENTITY_TYPE env, got %q", got)
	}
}

func TestOneCLIRunsWithoutManagedProvisioning(t *testing.T) {
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", t.TempDir())
	oneBin := writeFakeOne(t)
	client := &OneCLI{Bin: oneBin, WorkDir: t.TempDir()}
	result, err := client.ListConnections(context.Background(), ListConnectionsOptions{})
	if err != nil {
		t.Fatalf("expected local One config/bin fallback to run, got %v", err)
	}
	if got := len(result.Connections); got != 1 {
		t.Fatalf("expected 1 connection, got %d", got)
	}
}

func TestNewOneCLIFromEnvFallsBackToNpx(t *testing.T) {
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", t.TempDir())
	t.Setenv("LAF_OFFICE_ONE_BIN", "")
	installFakeOneCommand(t)
	installOneLookPath(t, map[string]bool{"npx": true})

	client := NewOneCLIFromEnv()
	if client.Bin != "npx" {
		t.Fatalf("expected npx fallback, got %q", client.Bin)
	}
	if got := strings.Join(client.ArgsPrefix, " "); got != "-y @withone/cli" {
		t.Fatalf("unexpected args prefix %q", got)
	}

	result, err := client.ListConnections(context.Background(), ListConnectionsOptions{})
	if err != nil {
		t.Fatalf("expected npx-backed one cli to run, got %v", err)
	}
	if got := len(result.Connections); got != 1 {
		t.Fatalf("expected 1 connection, got %d", got)
	}
}

func TestOneCLIListConnectionsUsesSafeActionWorkDir(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", homeDir)
	workDir := t.TempDir()
	traceFile := filepath.Join(t.TempDir(), "pwd.txt")
	oneBin := writeFakeOne(t)
	client := &OneCLI{Bin: oneBin, WorkDir: workDir, Env: []string{"LAF_OFFICE_TEST_ONE_TRACE_PWD=" + traceFile}}

	result, err := client.ListConnections(context.Background(), ListConnectionsOptions{})
	if err != nil {
		t.Fatalf("ListConnections returned error: %v", err)
	}
	if len(result.Connections) != 1 {
		t.Fatalf("expected 1 connection, got %d", len(result.Connections))
	}

	usedDirRaw, err := os.ReadFile(traceFile)
	if err != nil {
		t.Fatalf("read trace file: %v", err)
	}
	usedDir := strings.TrimSpace(string(usedDirRaw))
	expectedDir, err := filepath.EvalSymlinks(homeDir)
	if err != nil {
		t.Fatalf("resolve home dir: %v", err)
	}
	if usedDir != expectedDir {
		t.Fatalf("expected ListConnections to run from home dir %q, got %q", expectedDir, usedDir)
	}
}

func TestOneCLIExecuteWorkflowKeepsFlowWorkDir(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", homeDir)
	workDir := t.TempDir()
	traceFile := filepath.Join(t.TempDir(), "workflow-pwd.txt")
	oneBin := writeFakeOne(t)
	client := &OneCLI{Bin: oneBin, WorkDir: workDir, Env: []string{"LAF_OFFICE_TEST_ONE_TRACE_PWD=" + traceFile}}

	workflow, err := client.ExecuteWorkflow(context.Background(), WorkflowExecuteRequest{KeyOrPath: "welcome-flow"})
	if err != nil {
		t.Fatalf("ExecuteWorkflow returned error: %v", err)
	}
	if workflow.RunID != "run-1" || workflow.Status != "success" {
		t.Fatalf("unexpected workflow result %+v", workflow)
	}

	usedDirRaw, err := os.ReadFile(traceFile)
	if err != nil {
		t.Fatalf("read trace file: %v", err)
	}
	usedDir := strings.TrimSpace(string(usedDirRaw))
	expectedDir, err := filepath.EvalSymlinks(workDir)
	if err != nil {
		t.Fatalf("resolve workdir: %v", err)
	}
	if usedDir != expectedDir {
		t.Fatalf("expected ExecuteWorkflow to run from flow workdir %q, got %q", expectedDir, usedDir)
	}
}

func TestOneCLIExecuteActionAutoResolvesConnectionViaTempFlow(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("LAF_OFFICE_RUNTIME_HOME", homeDir)
	oneBin := writeFakeOne(t)
	client := &OneCLI{Bin: oneBin, WorkDir: t.TempDir()}

	result, err := client.ExecuteAction(context.Background(), ExecuteRequest{
		Platform: "slack",
		ActionID: "post-message",
		Data: map[string]any{
			"channel": "#ops",
			"text":    "hello",
		},
	})
	if err != nil {
		t.Fatalf("ExecuteAction returned error: %v", err)
	}
	if result.DryRun {
		t.Fatalf("expected live temp-flow execution result, got dry-run %+v", result)
	}
	if !strings.Contains(string(result.Response), `"posted":true`) {
		t.Fatalf("expected flow response payload, got %s", string(result.Response))
	}
}
