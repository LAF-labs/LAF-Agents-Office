package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
	bridgemcp "github.com/LAF-labs/LAF-Agents-Office/internal/bridge/mcp"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

func TestRunLinkBindingsAndUnlinkProject(t *testing.T) {
	t.Setenv(product.Env("BRIDGE_CONFIG_PATH"), filepath.Join(t.TempDir(), "config.json"))
	if err := bridge.SaveConfig("", bridge.Config{DeviceID: "device-1"}); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	if err := run([]string{
		"link-project",
		"--binding-id", "binding-1",
		"--project-id", "project-1",
		"--path", "/work/project",
		"--display-name", "Project",
	}, &stdout, &stderr); err != nil {
		t.Fatalf("link-project: %v stderr=%s", err, stderr.String())
	}
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Bindings) != 1 || cfg.Bindings[0].ID != "binding-1" || !cfg.Bindings[0].Trusted {
		t.Fatalf("binding not saved: %#v", cfg.Bindings)
	}
	stdout.Reset()
	if err := run([]string{"bindings"}, &stdout, &stderr); err != nil {
		t.Fatalf("bindings: %v", err)
	}
	if !strings.Contains(stdout.String(), "binding-1") {
		t.Fatalf("bindings output missing binding id: %s", stdout.String())
	}
	if err := run([]string{"unlink-project", "--binding-id", "binding-1"}, &stdout, &stderr); err != nil {
		t.Fatalf("unlink-project: %v", err)
	}
	cfg, err = bridge.LoadConfig("")
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Bindings) != 0 {
		t.Fatalf("binding not removed: %#v", cfg.Bindings)
	}
}

func TestRunMCPContextPrintConfig(t *testing.T) {
	secret := []byte("01234567890123456789012345678901")
	issuer := bridgemcp.NewTokenIssuer(secret)
	token, _, err := issuer.Issue(bridge.ExecutionPlan{
		EffectivePermissions: json.RawMessage(`["mcp:use_task_context"]`),
		ExpiresAt:            "2099-01-01T00:00:00Z",
		ID:                   "plan-1",
		TeamID:               "team-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	err = run([]string{
		"mcp-context",
		"--print-config",
		"--secret", base64.StdEncoding.EncodeToString(secret),
		"--token", token,
	}, &stdout, &stderr)
	if err != nil {
		t.Fatalf("mcp-context: %v stderr=%s", err, stderr.String())
	}
	if !strings.Contains(stdout.String(), `"configured": true`) {
		t.Fatalf("unexpected mcp-context output: %s", stdout.String())
	}
}

func TestRunMCPContextAcceptsClaimsFileWithoutSigningSecret(t *testing.T) {
	token := "opaque-token"
	claimsPath, err := writeMCPClaimsEnvelope(mcpClaimsEnvelope{
		Token: token,
		Claims: bridgemcp.TokenClaims{
			ExpiresAt:   time.Now().Add(time.Minute).Unix(),
			Permissions: []string{bridgemcp.PermissionTaskContext},
			PlanID:      "plan-1",
			TeamID:      "team-1",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(claimsPath)
	t.Setenv(mcpClaimsPathEnv, claimsPath)
	t.Setenv(mcpSecretEnv, "")

	var stdout, stderr bytes.Buffer
	err = run([]string{
		"mcp-context",
		"--print-config",
		"--token", token,
	}, &stdout, &stderr)
	if err != nil {
		t.Fatalf("mcp-context with claims file: %v stderr=%s", err, stderr.String())
	}
	if !strings.Contains(stdout.String(), `"configured": true`) {
		t.Fatalf("unexpected mcp-context output: %s", stdout.String())
	}
}

func TestRunStartDaemonPollsUntilContextCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	seen := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method+" "+r.URL.Path != "GET /bridge/devices/device-1/pending-plans" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		select {
		case seen <- struct{}{}:
		default:
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"plans": []bridge.ExecutionPlan{}})
	}))
	defer server.Close()

	go func() {
		<-seen
		time.Sleep(5 * time.Millisecond)
		cancel()
	}()

	dir := t.TempDir()
	t.Setenv(product.Env("BRIDGE_CONFIG_PATH"), filepath.Join(dir, "config.json"))
	t.Setenv(product.Env("BRIDGE_TOKEN_PATH"), filepath.Join(dir, "token"))
	tokenRef, err := bridge.StoreTokenFallback("", "bridge-token")
	if err != nil {
		t.Fatal(err)
	}
	if err := bridge.SaveConfig("", bridge.Config{
		APIURL:   server.URL,
		DeviceID: "device-1",
		TokenRef: tokenRef,
		UserID:   "user-1",
	}); err != nil {
		t.Fatal(err)
	}

	var stdout, stderr bytes.Buffer
	err = runWithContext(ctx, []string{
		"start",
		"--once=false",
		"--interval=1h",
		"--provider=fake",
	}, &stdout, &stderr)
	if err != nil {
		t.Fatalf("start daemon: %v stderr=%s", err, stderr.String())
	}
	if !strings.Contains(stdout.String(), "laf-bridge polling device device-1") {
		t.Fatalf("daemon output missing polling status: %s", stdout.String())
	}
}
