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
	if err := fs.Parse(args); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cfg, err := bridge.Pair(ctx, bridge.PairOptions{
		APIURL:      *apiURL,
		Code:        *code,
		DeviceLabel: *label,
		PublicKey:   *publicKey,
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
		"api_url":      cfg.APIURL,
		"configured":   cfg.DeviceID != "",
		"device_id":    cfg.DeviceID,
		"device_label": cfg.DeviceLabel,
		"team_id":      cfg.TeamID,
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
		"config_path": bridge.ConfigPath(),
		"configured":  cfg.DeviceID != "",
		"device_id":   cfg.DeviceID,
		"providers":   caps,
		"token_path":  bridge.TokenPath(),
	})
}

func runProviders(stdout io.Writer) error {
	return writeJSON(
		stdout,
		bridge.DetectCapabilities(context.Background(), bridge.ProviderDetector{}),
	)
}

func runStart(args []string, stdout io.Writer) error {
	fs := flag.NewFlagSet("start", flag.ContinueOnError)
	once := fs.Bool("once", true, "poll once and exit")
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
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client := bridge.Client{APIURL: cfg.APIURL, Token: token}
	plans, err := client.PendingPlans(ctx, cfg.DeviceID)
	if err != nil {
		return err
	}
	fmt.Fprintf(stdout, "pending plans: %d\n", len(plans))
	return nil
}

func writeJSON(w io.Writer, value any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(value)
}

func usage(w io.Writer) {
	fmt.Fprintln(w, "usage: laf-bridge <pair|status|doctor|providers|start>")
}
