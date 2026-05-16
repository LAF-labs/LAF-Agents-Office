package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/config"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

func TestIsolateProbeRuntimePinsConfigAndBrokerStateToTempHome(t *testing.T) {
	tmp := t.TempDir()
	external := filepath.Join(tmp, "real-config.json")
	if err := os.WriteFile(external, []byte(`{"api_key":"real"}`+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv(product.Env("CONFIG_PATH"), external)
	t.Setenv(product.Env("RUNTIME_HOME"), filepath.Join(tmp, "real-runtime"))
	t.Setenv(product.Env("BROKER_STATE_PATH"), filepath.Join(tmp, "real-broker.json"))

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
	if got := os.Getenv(product.Env("BROKER_STATE_PATH")); got != product.RuntimePath(probeHome, "team", "broker-state.json") {
		t.Fatalf("broker state path = %q", got)
	}
}

func TestNormalizeReplyForCheckRejectsEmbeddedWords(t *testing.T) {
	if normalizeReplyForCheck("not 40") == normalizeReplyForCheck("40") {
		t.Fatal("reply normalization must not accept answers that merely contain the expected number")
	}
	if got := normalizeReplyForCheck("`OK, 42.`"); got != "ok, 42" {
		t.Fatalf("normalized reply = %q", got)
	}
}
