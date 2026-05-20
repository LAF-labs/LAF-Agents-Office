package main

import (
	"bufio"
	"context"
	"crypto/rand"
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
	"github.com/LAF-labs/LAF-Agents-Office/internal/buildinfo"
)

const (
	mcpTokenEnv       = "LAF_BRIDGE_MCP_TOKEN"
	mcpSecretEnv      = "LAF_BRIDGE_MCP_SECRET"
	mcpContextPathEnv = "LAF_BRIDGE_MCP_CONTEXT_PATH"
	mcpClaimsPathEnv  = "LAF_BRIDGE_MCP_CLAIMS_PATH"
	providerEnv       = "LAF_BRIDGE_EXECUTION_PROVIDER"
)

var errHelpHandled = errors.New("help handled")

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := runWithContextIO(ctx, os.Args[1:], os.Stdin, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "laf-bridge:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout, stderr io.Writer) error {
	return runWithContext(context.Background(), args, stdout, stderr)
}

func runWithContext(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	return runWithContextIO(ctx, args, strings.NewReader(""), stdout, stderr)
}

func runWithContextIO(ctx context.Context, args []string, stdin io.Reader, stdout, stderr io.Writer) error {
	if len(args) == 0 || isHelpArg(args[0]) {
		usage(stdout)
		return nil
	}
	if isVersionArg(args[0]) {
		_, _ = fmt.Fprintf(stdout, "laf-bridge v%s\n", buildinfo.Current().Version)
		return nil
	}
	switch args[0] {
	case "help":
		usage(stdout)
		return nil
	case "pair":
		return runPair(ctx, args[1:], stdin, stdout)
	case "status":
		return runStatus(stdout)
	case "doctor":
		return runDoctor(ctx, stdout)
	case "providers":
		return runProviders(ctx, stdout)
	case "start":
		return runStart(ctx, args[1:], stdout)
	case "mcp-context":
		return runMCPContext(ctx, args[1:], stdout)
	default:
		usage(stderr)
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func runPair(ctx context.Context, args []string, stdin io.Reader, stdout io.Writer) error {
	fs := flag.NewFlagSet("pair", flag.ContinueOnError)
	apiURL := fs.String("api-url", "", "LAF hosted API URL for automation")
	code := fs.String("code", "", "pairing or setup code for automation")
	label := fs.String("device-label", "", "local device label")
	publicKey := fs.String("public-key", "", "bridge public key")
	identityPath := fs.String("identity-path", "", "bridge identity private key path")
	start := fs.Bool("start", true, "start the local bridge loop after pairing")
	once := fs.Bool("once", false, "when starting after pair, poll once and exit")
	fs.Usage = func() {
		pairUsage(stdout)
	}
	if err := parseFlags(fs, args, stdout); err != nil {
		if errors.Is(err, errHelpHandled) {
			return nil
		}
		return err
	}
	resolvedAPIURL, resolvedCode, err := resolvePairInputs(*apiURL, *code, stdin, stdout)
	if err != nil {
		return err
	}
	pairCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cfg, err := bridge.Pair(pairCtx, bridge.PairOptions{
		APIURL:       resolvedAPIURL,
		Code:         resolvedCode,
		DeviceLabel:  *label,
		IdentityPath: *identityPath,
		PublicKey:    *publicKey,
	})
	if err != nil {
		return err
	}
	writef(stdout, "paired device %s\n", cfg.DeviceID)
	if !*start {
		return nil
	}
	providerName := strings.TrimSpace(os.Getenv(providerEnv))
	if providerName == "" {
		providerName = "auto"
	}
	startArgs := []string{"--once=false", "--auto-approve=true", "--provider=" + providerName}
	if *once {
		startArgs = []string{"--once=true", "--auto-approve=true", "--provider=" + providerName}
	}
	return runStart(ctx, startArgs, stdout)
}

func resolvePairInputs(apiURL string, code string, stdin io.Reader, stdout io.Writer) (string, string, error) {
	apiURL = firstNonEmpty(
		apiURL,
		os.Getenv("LAF_BRIDGE_API_URL"),
		os.Getenv("LAF_HOSTED_API_URL"),
		os.Getenv("LAF_OFFICE_HOSTED_API_URL"),
	)
	code = firstNonEmpty(code, os.Getenv("LAF_BRIDGE_SETUP_CODE"))

	if decodedAPIURL, decodedCode, ok := decodeBridgeSetupCode(code); ok {
		apiURL = decodedAPIURL
		code = decodedCode
	}

	if strings.TrimSpace(code) == "" && stdin != nil {
		writeln(stdout, "Paste the LAF Bridge setup code from Settings -> LAF Bridge, then press Enter:")
		line, err := bufio.NewReader(stdin).ReadString('\n')
		if err != nil && !errors.Is(err, io.EOF) {
			return "", "", err
		}
		line = strings.TrimSpace(line)
		if decodedAPIURL, decodedCode, ok := decodeBridgeSetupCode(line); ok {
			apiURL = decodedAPIURL
			code = decodedCode
		} else {
			code = line
		}
	}

	apiURL = strings.TrimSpace(apiURL)
	code = strings.TrimSpace(code)
	if apiURL == "" {
		return "", "", fmt.Errorf("api url is required; paste the setup code from Settings -> LAF Bridge or set LAF_BRIDGE_API_URL for automation")
	}
	if code == "" {
		return "", "", fmt.Errorf("setup code is required; create one in Settings -> LAF Bridge")
	}
	return apiURL, code, nil
}

func decodeBridgeSetupCode(raw string) (string, string, bool) {
	candidate := strings.Join(strings.Fields(raw), "")
	if candidate == "" {
		return "", "", false
	}
	decoders := []*base64.Encoding{
		base64.RawURLEncoding,
		base64.URLEncoding,
		base64.RawStdEncoding,
		base64.StdEncoding,
	}
	for _, decoder := range decoders {
		decoded, err := decoder.DecodeString(candidate)
		if err != nil {
			continue
		}
		var payload struct {
			APIURL string `json:"api_url"`
			Code   string `json:"code"`
		}
		if err := json.Unmarshal(decoded, &payload); err != nil {
			continue
		}
		apiURL := strings.TrimSpace(payload.APIURL)
		code := strings.TrimSpace(payload.Code)
		if apiURL != "" && code != "" {
			return apiURL, code, true
		}
	}
	return "", "", false
}

func runStatus(stdout io.Writer) error {
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		return err
	}
	status := map[string]any{
		"api_url":      cfg.APIURL,
		"configured":   cfg.DeviceID != "",
		"device_id":    cfg.DeviceID,
		"device_label": cfg.DeviceLabel,
		"team_id":      cfg.TeamID,
	}
	return writeJSON(stdout, status)
}

func runDoctor(ctx context.Context, stdout io.Writer) error {
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		return err
	}
	caps := bridge.DetectCapabilities(ctx, bridge.ProviderDetector{})
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

func runProviders(ctx context.Context, stdout io.Writer) error {
	return writeJSON(
		stdout,
		bridge.DetectCapabilities(ctx, bridge.ProviderDetector{}),
	)
}

func runStart(ctx context.Context, args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("start", flag.ContinueOnError)
	once := fs.Bool("once", true, "poll once and exit")
	interval := fs.Duration("interval", 15*time.Second, "polling interval when --once=false")
	relay := fs.Bool("relay", true, "subscribe to the configured Supabase Realtime relay when --once=false")
	providerName := fs.String("provider", "auto", "execution provider: auto, codex, claude, or fake")
	model := fs.String("model", "", "provider model override")
	planPublicKey := fs.String("plan-public-key", "", "base64 or PEM Ed25519 execution-plan signing public key")
	autoApprove := fs.Bool("auto-approve", false, "approve plans that require local approval")
	allowDangerFullAccess := fs.Bool("allow-danger-full-access", false, "allow danger-full-access plan policy")
	allowDeploy := fs.Bool("allow-deploy", false, "allow deploy plan policy")
	allowDestructiveShell := fs.Bool("allow-destructive-shell", false, "allow destructive shell plan policy")
	allowGitPush := fs.Bool("allow-git-push", false, "allow git push plan policy")
	allowNetwork := fs.Bool("allow-network", false, "allow network plan policy")
	mcpContext := fs.Bool("mcp-context", true, "inject task-scoped MCP context into codex exec")
	mcpContextPath := fs.String("mcp-context-path", "", "optional local MCP context JSON file")
	mcpCommand := fs.String("mcp-command", "", "laf-bridge command path for Codex MCP config")
	if err := parseFlags(fs, args, stdout); err != nil {
		if errors.Is(err, errHelpHandled) {
			return nil
		}
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
	approver := bridge.LocalPolicyApprover{
		Config: cfg,
		Options: bridge.LocalPolicyOptions{
			AutoApproveRequired:   *autoApprove,
			AllowDangerFullAccess: *allowDangerFullAccess,
			AllowDeploy:           *allowDeploy,
			AllowDestructiveShell: *allowDestructiveShell,
			AllowGitPush:          *allowGitPush,
			AllowNetwork:          *allowNetwork,
		},
	}
	pendingExecutor := bridge.PendingExecutorFunc(func(runCtx context.Context) ([]bridge.RunResult, error) {
		if _, err := client.Heartbeat(runCtx, cfg, bridge.DetectCapabilities(runCtx, bridge.ProviderDetector{})); err != nil {
			return nil, err
		}
		return bridge.RunPendingOnceWithOptions(runCtx, cfg, client, validator, bridge.RunPendingOptions{
			Approver: approver,
			Executor: executor,
			Guard:    guard,
		})
	})
	if !*once {
		pollInterval := *interval
		if pollInterval <= 0 {
			pollInterval = 10 * time.Second
		}
		if *relay {
			if source := bridge.SupabaseRelaySourceFromEnv(); source != nil {
				writef(stdout, "laf-bridge relay device %s via Supabase Realtime; polling fallback every %s\n", cfg.DeviceID, pollInterval.String())
				err := (bridge.RelayLoop{
					DeviceID:     cfg.DeviceID,
					PollInterval: pollInterval,
					ReconnectMin: 5 * time.Second,
					Executor:     pendingExecutor,
					Source:       source,
				}).Run(ctx)
				if errors.Is(err, context.Canceled) {
					return nil
				}
				return err
			}
		}
		writef(stdout, "laf-bridge polling device %s every %s\n", cfg.DeviceID, pollInterval.String())
		err := (bridge.PollLoop{Interval: pollInterval, Executor: pendingExecutor}).Run(ctx)
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return err
	}
	results, err := pendingExecutor.RunPending(ctx)
	if err != nil {
		return err
	}
	return writeJSON(stdout, map[string]any{"results": results})
}

func runMCPContext(ctx context.Context, args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("mcp-context", flag.ContinueOnError)
	tokenFlag := fs.String("token", "", "task-scoped MCP token")
	secretFlag := fs.String("secret", "", "MCP token HMAC secret, raw or base64")
	contextPathFlag := fs.String("context-path", "", "local MCP context JSON file")
	printConfig := fs.Bool("print-config", false, "print configuration summary and exit")
	if err := parseFlags(fs, args, stdout); err != nil {
		if errors.Is(err, errHelpHandled) {
			return nil
		}
		return err
	}
	token := firstNonEmpty(*tokenFlag, os.Getenv(mcpTokenEnv))
	secretRaw := firstNonEmpty(*secretFlag, os.Getenv(mcpSecretEnv))
	contextPath := firstNonEmpty(*contextPathFlag, os.Getenv(mcpContextPathEnv))
	claimsPath := strings.TrimSpace(os.Getenv(mcpClaimsPathEnv))
	if strings.TrimSpace(token) == "" {
		return fmt.Errorf("%s is required", mcpTokenEnv)
	}
	store, err := bridgemcp.LoadStaticContextStore(contextPath)
	if err != nil {
		return err
	}
	var gateway bridgemcp.Gateway
	if claimsPath != "" {
		envelope, err := loadMCPClaimsEnvelope(claimsPath)
		if err != nil {
			return err
		}
		if envelope.Token != token {
			return bridgemcp.ErrInvalidToken
		}
		gateway = bridgemcp.Gateway{
			StaticToken:  envelope.Token,
			StaticClaims: &envelope.Claims,
			Store:        store,
		}
	} else {
		secret, err := decodeMCPSecret(secretRaw)
		if err != nil {
			return err
		}
		issuer := bridgemcp.NewTokenIssuer(secret)
		if _, err := issuer.Validate(token); err != nil {
			return err
		}
		gateway = bridgemcp.Gateway{Issuer: issuer, Store: store}
	}
	if *printConfig {
		return writeJSON(stdout, map[string]any{
			"configured":   true,
			"context_path": contextPath,
			"token":        "present",
		})
	}
	server := bridgemcp.ContextServer{
		Gateway: gateway,
		Token:   token,
	}
	return server.RunStdio(ctx)
}

type mcpClaimsEnvelope struct {
	Token  string                `json:"token"`
	Claims bridgemcp.TokenClaims `json:"claims"`
}

func loadMCPClaimsEnvelope(path string) (mcpClaimsEnvelope, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return mcpClaimsEnvelope{}, err
	}
	var envelope mcpClaimsEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return mcpClaimsEnvelope{}, err
	}
	if strings.TrimSpace(envelope.Token) == "" {
		return mcpClaimsEnvelope{}, fmt.Errorf("MCP claims file missing token")
	}
	return envelope, nil
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

func (e mcpCodexExecutor) Execute(ctx context.Context, plan bridge.ExecutionPlan) (bridge.ExecutionOutcome, error) {
	issuer := bridgemcp.NewTokenIssuer(e.secret)
	_, claims, err := issuer.Issue(plan)
	if err != nil {
		return bridge.ExecutionOutcome{}, err
	}
	token, err := randomMCPToken()
	if err != nil {
		return bridge.ExecutionOutcome{}, err
	}
	claimsPath, err := writeMCPClaimsEnvelope(mcpClaimsEnvelope{Token: token, Claims: claims})
	if err != nil {
		return bridge.ExecutionOutcome{}, err
	}
	defer func() { _ = os.Remove(claimsPath) }()
	command := strings.TrimSpace(e.command)
	if command == "" {
		command = executablePath()
	}
	env := map[string]string{
		mcpTokenEnv:      token,
		mcpClaimsPathEnv: claimsPath,
	}
	envVars := []string{mcpTokenEnv, mcpClaimsPathEnv}
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
	return exec.Execute(ctx, plan)
}

func randomMCPToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func writeMCPClaimsEnvelope(envelope mcpClaimsEnvelope) (string, error) {
	file, err := os.CreateTemp("", "laf-bridge-mcp-claims-*.json")
	if err != nil {
		return "", err
	}
	path := file.Name()
	enc := json.NewEncoder(file)
	enc.SetIndent("", "  ")
	if err := enc.Encode(envelope); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return "", err
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

type routingExecutor struct {
	codex  bridge.PlanExecutor
	claude bridge.PlanExecutor
	fake   bridge.PlanExecutor
}

func (e routingExecutor) Execute(ctx context.Context, plan bridge.ExecutionPlan) (bridge.ExecutionOutcome, error) {
	switch normalizeExecutionProvider(plan.Provider) {
	case "claude-code":
		return e.claude.Execute(ctx, plan)
	case "codex", "auto", "":
		return e.codex.Execute(ctx, plan)
	case "fake":
		return e.fake.Execute(ctx, plan)
	default:
		return bridge.ExecutionOutcome{}, fmt.Errorf("unsupported execution provider %q", plan.Provider)
	}
}

func bridgeExecutor(providerName string, model string, opts mcpOptions) (bridge.PlanExecutor, error) {
	codex, err := codexExecutor(model, opts)
	if err != nil {
		return nil, err
	}
	claude := bridgeproviders.ClaudeExec{Model: model}
	switch normalizeExecutionProvider(providerName) {
	case "", "auto":
		return routingExecutor{codex: codex, claude: claude, fake: bridge.FakeExecutor{}}, nil
	case "codex":
		return codex, nil
	case "claude-code":
		return claude, nil
	case "fake":
		return bridge.FakeExecutor{}, nil
	default:
		return nil, fmt.Errorf("unsupported provider %q", providerName)
	}
}

func codexExecutor(model string, opts mcpOptions) (bridge.PlanExecutor, error) {
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
}

func normalizeExecutionProvider(value string) string {
	switch strings.ToLower(strings.TrimSpace(strings.ReplaceAll(value, "_", "-"))) {
	case "", "auto":
		return "auto"
	case "codex":
		return "codex"
	case "claude", "claude-code":
		return "claude-code"
	case "fake":
		return "fake"
	default:
		return strings.ToLower(strings.TrimSpace(value))
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

func parseFlags(fs *flag.FlagSet, args []string, stdout io.Writer) error {
	fs.SetOutput(stdout)
	if hasHelpArg(args) {
		fs.Usage()
		return errHelpHandled
	}
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return errHelpHandled
		}
		return err
	}
	return nil
}

func hasHelpArg(args []string) bool {
	for _, arg := range args {
		if isHelpArg(arg) {
			return true
		}
	}
	return false
}

func isHelpArg(arg string) bool {
	return arg == "-h" || arg == "--help"
}

func isVersionArg(arg string) bool {
	return arg == "version" || arg == "-version" || arg == "--version"
}

func writeJSON(w io.Writer, value any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(value)
}

func writef(w io.Writer, format string, args ...any) {
	_, _ = fmt.Fprintf(w, format, args...)
}

func writeln(w io.Writer, args ...any) {
	_, _ = fmt.Fprintln(w, args...)
}

func usage(w io.Writer) {
	writeln(w, "usage: laf-bridge pair")
	writeln(w)
	writeln(w, "Pair this computer with a hosted LAF Office workspace.")
	writeln(w, "Create a setup code in Settings -> LAF Bridge, run this command, then paste the code when prompted.")
}

func pairUsage(w io.Writer) {
	writeln(w, "usage: laf-bridge pair")
	writeln(w)
	writeln(w, "Create a setup code in Settings -> LAF Bridge.")
	writeln(w, "Run this command, paste the setup code when prompted, and keep the terminal open.")
}
