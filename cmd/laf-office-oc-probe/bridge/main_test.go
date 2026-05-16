package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

func TestIsolateProbeRuntimeDoesNotOverwriteExternalConfig(t *testing.T) {
	tmp := t.TempDir()
	external := filepath.Join(tmp, "external-config.json")
	if err := os.WriteFile(external, []byte(`{"api_key":"real"}`+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv(product.Env("CONFIG_PATH"), external)
	t.Setenv(product.Env("RUNTIME_HOME"), filepath.Join(tmp, "external-runtime"))
	t.Setenv(product.Env("BROKER_STATE_PATH"), filepath.Join(tmp, "external-broker.json"))

	probeHome := filepath.Join(tmp, "probe-home")
	if err := isolateProbeRuntime(probeHome, "/tmp/openclaw-identity.json", "token"); err != nil {
		t.Fatal(err)
	}
	if err := config.Save(config.Config{OpenclawGatewayURL: "ws://127.0.0.1:18789"}); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(external)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"api_key":"real"}`+"\n" {
		t.Fatalf("external config was modified: %s", raw)
	}
	if got := os.Getenv(product.Env("CONFIG_PATH")); got != product.RuntimePath(probeHome, "config.json") {
		t.Fatalf("config path = %q", got)
	}
}
