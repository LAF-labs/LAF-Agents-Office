package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
	bridgeproviders "github.com/LAF-labs/LAF-Agents-Office/internal/bridge/providers"
)

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "laf-bridge:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout, stderr io.Writer) error {
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
		return runStart(args[1:], stdout)
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

func runStart(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("start", flag.ContinueOnError)
	once := fs.Bool("once", true, "poll once and exit")
	providerName := fs.String("provider", "codex", "execution provider: codex or fake")
	model := fs.String("model", "", "provider model override")
	planPublicKey := fs.String("plan-public-key", "", "base64 or PEM Ed25519 execution-plan signing public key")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if !*once {
		return fmt.Errorf("daemon mode is not implemented in the skeleton")
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
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client := bridge.Client{APIURL: cfg.APIURL, Token: token}
	executor, err := bridgeExecutor(*providerName, *model)
	if err != nil {
		return err
	}
	results, err := bridge.RunPendingOnceWithExecutor(ctx, cfg, client, validator, executor)
	if err != nil {
		return err
	}
	return writeJSON(stdout, map[string]any{"results": results})
}

func bridgeExecutor(providerName string, model string) (bridge.PlanExecutor, error) {
	switch providerName {
	case "", "codex":
		return bridgeproviders.CodexExec{Model: model}, nil
	case "fake":
		return bridge.FakeExecutor{}, nil
	default:
		return nil, fmt.Errorf("unsupported provider %q", providerName)
	}
}

func writeJSON(w io.Writer, value any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(value)
}

func usage(w io.Writer) {
	fmt.Fprintln(w, "usage: laf-bridge <pair|status|doctor|providers|bindings|link-project|unlink-project|start>")
}
