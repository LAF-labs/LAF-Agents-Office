package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
	bridgemcp "github.com/LAF-labs/LAF-Agents-Office/internal/bridge/mcp"
	bridgeproviders "github.com/LAF-labs/LAF-Agents-Office/internal/bridge/providers"
)

const (
	mcpTokenEnv       = "LAF_BRIDGE_MCP_TOKEN"
	mcpSecretEnv      = "LAF_BRIDGE_MCP_SECRET"
	mcpContextPathEnv = "LAF_BRIDGE_MCP_CONTEXT_PATH"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := runWithContext(ctx, os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "laf-bridge:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout, stderr io.Writer) error {
	return runWithContext(context.Background(), args, stdout, stderr)
}

func runWithContext(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 {
		usage(stderr)
		return flag.ErrHelp
	}
	switch args[0] {
	case "pair":
		return runPair(args[1:], stdout)
	case "status":
		return runStatus(stdout)
	case "doctor":
		return runDoctor(stdout)
	case "providers":
		return runProviders(stdout)
	case "bindings":
		return runBindings(stdout)
	case "link-project":
		return runLinkProject(args[1:], stdout)
	case "unlink-project":
		return runUnlinkProject(args[1:], stdout)
	case "start":
		return runStart(ctx, args[1:], stdout)
	case "mcp-context":
		return runMCPContext(args[1:], stdout)
	default:
		usage(stderr)
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func runPair(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("pair", flag.ContinueOnError)
	apiURL := fs.String("api-url", "", "LAF hosted API URL, usually https://host/api")
	code := fs.String("code", "", "pairing code from the web app")
	label := fs.String("device-label", "", "local device label")
	publicKey := fs.String("public-key", "", "bridge public key")
	identityPath := fs.String("identity-path", "", "bridge identity private key path")
	if err := fs.Parse(args); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cfg, err := bridge.Pair(ctx, bridge.PairOptions{
		APIURL:       *apiURL,
		Code:         *code,
		DeviceLabel:  *label,
		IdentityPath: *identityPath,
		PublicKey:    *publicKey,
	})
	if err != nil {
		return err
	}
	fmt.Fprintf(stdout, "paired device %s\n", cfg.DeviceID)
	return nil
}

func runStatus(stdout io.Writer) error {
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		return err
	}
	status := map[string]any{
		"api_url":       cfg.APIURL,
		"configured":    cfg.DeviceID != "",
		"device_id":     cfg.DeviceID,
		"device_label":  cfg.DeviceLabel,
		"binding_count": len(cfg.Bindings),
		"team_id":       cfg.TeamID,
	}
	return writeJSON(stdout, status)
}

func runDoctor(stdout io.Writer) error {
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		return err
	}
	caps := bridge.DetectCapabilities(context.Background(), bridge.ProviderDetector{})
	return writeJSON(stdout, map[string]any{
		"config_path":                 bridge.ConfigPath(),
		"configured":                  cfg.DeviceID != "",
		"device_id":                   cfg.DeviceID,
		"identity_path":               bridge.IdentityPath(),
		"plan_signature_verification": cfg.PlanSigningPublicKey != "",
		"providers":                   caps,
		"token_path":                  bridge.TokenPath(),
	})
}

func runProviders(stdout io.Writer) error {
	return writeJSON(
		stdout,
		bridge.DetectCapabilities(context.Background(), bridge.ProviderDetector{}),
	)
}

func runBindings(stdout io.Writer) error {
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		return err
	}
	return writeJSON(stdout, map[string]any{"bindings": cfg.Bindings})
}

func runLinkProject(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("link-project", flag.ContinueOnError)
	bindingID := fs.String("binding-id", "", "hosted project_local_bindings id")
	projectID := fs.String("project-id", "", "hosted project id")
	localPath := fs.String("path", "", "trusted local project path")
	displayName := fs.String("display-name", "", "local binding display name")
	trusted := fs.Bool("trusted", true, "mark the local binding as trusted")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		return err
	}
	next, err := bridge.UpsertProjectBinding(cfg, bridge.ProjectBinding{
		ID:          *bindingID,
		ProjectID:   *projectID,
		DeviceID:    cfg.DeviceID,
		DisplayName: *displayName,
		LocalPath:   *localPath,
		Trusted:     *trusted,
	})
	if err != nil {
		return err
	}
	if err := bridge.SaveConfig("", next); err != nil {
		return err
	}
	fmt.Fprintf(stdout, "linked binding %s\n", *bindingID)
	return nil
}

func runUnlinkProject(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("unlink-project", flag.ContinueOnError)
	bindingID := fs.String("binding-id", "", "hosted project_local_bindings id")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		return err
	}
	next, removed := bridge.RemoveProjectBinding(cfg, *bindingID)
	if !removed {
		return fmt.Errorf("binding %q is not configured", *bindingID)
	}
	if err := bridge.SaveConfig("", next); err != nil {
		return err
	}
	fmt.Fprintf(stdout, "unlinked binding %s\n", *bindingID)
	return nil
}

func runStart(ctx context.Context, args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("start", flag.ContinueOnError)
	once := fs.Bool("once", true, "poll once and exit")
	interval := fs.Duration("interval", 15*time.Second, "polling interval when --once=false")
	providerName := fs.String("provider", "codex", "execution provider: codex or fake")
	model := fs.String("model", "", "provider model override")
	planPublicKey := fs.String("plan-public-key", "", "base64 or PEM Ed25519 execution-plan signing public key")
	mcpContext := fs.Bool("mcp-context", true, "inject task-scoped MCP context into codex exec")
	mcpContextPath := fs.String("mcp-context-path", "", "optional local MCP context JSON file")
	mcpCommand := fs.String("mcp-command", "", "laf-bridge command path for Codex MCP config")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		return err
	}
	token, err := bridge.ResolveToken(cfg)
	if err != nil {
		return err
	}
	if *planPublicKey != "" {
		cfg.PlanSigningPublicKey = *planPublicKey
	}
	validator, err := bridge.PlanValidatorFromConfig(cfg)
	if err != nil {
		return err
	}
	client := bridge.Client{APIURL: cfg.APIURL, Token: token}
	executor, err := bridgeExecutor(*providerName, *model, mcpOptions{
		Command:     *mcpCommand,
		ContextPath: *mcpContextPath,
		Enabled:     *mcpContext,
	})
	if err != nil {
		return err
	}
	guard := bridge.NewPlanRunGuard()
	runner := bridge.PendingRunnerFunc(func(runCtx context.Context) ([]bridge.RunResult, error) {
		return bridge.RunPendingOnceWithOptions(runCtx, cfg, client, validator, bridge.RunPendingOptions{
			Executor: executor,
			Guard:    guard,
		})
	})
	if !*once {
		pollInterval := *interval
		if pollInterval <= 0 {
			pollInterval = 10 * time.Second
		}
		fmt.Fprintf(stdout, "laf-bridge polling device %s every %s\n", cfg.DeviceID, pollInterval.String())
		err := (bridge.PollLoop{Interval: pollInterval, Runner: runner}).Run(ctx)
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return err
	}
	runCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	results, err := bridge.RunPendingOnceWithOptions(runCtx, cfg, client, validator, bridge.RunPendingOptions{
		Executor: executor,
		Guard:    guard,
	})
	if err != nil {
		return err
	}
	return writeJSON(stdout, map[string]any{"results": results})
}

func runMCPContext(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("mcp-context", flag.ContinueOnError)
	tokenFlag := fs.String("token", "", "task-scoped MCP token")
	secretFlag := fs.String("secret", "", "MCP token HMAC secret, raw or base64")
	contextPathFlag := fs.String("context-path", "", "local MCP context JSON file")
	printConfig := fs.Bool("print-config", false, "print configuration summary and exit")
	if err := fs.Parse(args); err != nil {
		return err
	}
	token := firstNonEmpty(*tokenFlag, os.Getenv(mcpTokenEnv))
	secretRaw := firstNonEmpty(*secretFlag, os.Getenv(mcpSecretEnv))
	contextPath := firstNonEmpty(*contextPathFlag, os.Getenv(mcpContextPathEnv))
	if strings.TrimSpace(token) == "" {
		return fmt.Errorf("%s is required", mcpTokenEnv)
	}
	secret, err := decodeMCPSecret(secretRaw)
	if err != nil {
		return err
	}
	issuer := bridgemcp.NewTokenIssuer(secret)
	if _, err := issuer.Validate(token); err != nil {
		return err
	}
	store, err := bridgemcp.LoadStaticContextStore(contextPath)
	if err != nil {
		return err
	}
	if *printConfig {
		return writeJSON(stdout, map[string]any{
			"configured":   true,
			"context_path": contextPath,
			"token":        "present",
		})
	}
	server := bridgemcp.ContextServer{
		Gateway: bridgemcp.Gateway{Issuer: issuer, Store: store},
		Token:   token,
	}
	return server.RunStdio(context.Background())
}

type mcpOptions struct {
	Command     string
	ContextPath string
	Enabled     bool
}

type mcpCodexExecutor struct {
	base        bridgeproviders.CodexExec
	command     string
	contextPath string
	secret      []byte
}

func (e mcpCodexExecutor) Execute(ctx context.Context, plan bridge.ExecutionPlan, binding bridge.ProjectBinding) (bridge.ExecutionOutcome, error) {
	issuer := bridgemcp.NewTokenIssuer(e.secret)
	token, _, err := issuer.Issue(plan)
	if err != nil {
		return bridge.ExecutionOutcome{}, err
	}
	command := strings.TrimSpace(e.command)
	if command == "" {
		command = executablePath()
	}
	env := map[string]string{
		mcpSecretEnv: base64.StdEncoding.EncodeToString(e.secret),
		mcpTokenEnv:  token,
	}
	envVars := []string{mcpSecretEnv, mcpTokenEnv}
	if strings.TrimSpace(e.contextPath) != "" {
		env[mcpContextPathEnv] = strings.TrimSpace(e.contextPath)
		envVars = append(envVars, mcpContextPathEnv)
	}
	exec := e.base
	exec.Env = mergeEnv(exec.Env, env)
	exec.ConfigOverrides = append(
		append([]string(nil), exec.ConfigOverrides...),
		bridgemcp.CodexConfigOverrides(command, []string{"mcp-context"}, envVars)...,
	)
	return exec.Execute(ctx, plan, binding)
}

func bridgeExecutor(providerName string, model string, opts mcpOptions) (bridge.PlanExecutor, error) {
	switch providerName {
	case "", "codex":
		exec := bridgeproviders.CodexExec{Model: model}
		if !opts.Enabled {
			return exec, nil
		}
		secret, err := bridgemcp.GenerateSecret()
		if err != nil {
			return nil, err
		}
		return mcpCodexExecutor{
			base:        exec,
			command:     opts.Command,
			contextPath: opts.ContextPath,
			secret:      secret,
		}, nil
	case "fake":
		return bridge.FakeExecutor{}, nil
	default:
		return nil, fmt.Errorf("unsupported provider %q", providerName)
	}
}

func decodeMCPSecret(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("%s is required", mcpSecretEnv)
	}
	for _, decoder := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.RawURLEncoding} {
		if decoded, err := decoder.DecodeString(raw); err == nil && len(decoded) > 0 {
			return decoded, nil
		}
	}
	return []byte(raw), nil
}

func executablePath() string {
	path, err := os.Executable()
	if err != nil || strings.TrimSpace(path) == "" {
		return "laf-bridge"
	}
	return path
}

func mergeEnv(base map[string]string, override map[string]string) map[string]string {
	out := map[string]string{}
	for key, value := range base {
		out[key] = value
	}
	for key, value := range override {
		out[key] = value
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func writeJSON(w io.Writer, value any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(value)
}

func usage(w io.Writer) {
	fmt.Fprintln(w, "usage: laf-bridge <pair|status|doctor|providers|bindings|link-project|unlink-project|start|mcp-context>")
}
