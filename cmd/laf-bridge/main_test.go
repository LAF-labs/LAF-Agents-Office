package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/bridge"
	bridgemcp "github.com/LAF-labs/LAF-Agents-Office/internal/bridge/mcp"
	"github.com/LAF-labs/LAF-Agents-Office/internal/buildinfo"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

func TestRunHelpExitsCleanly(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		want    []string
		notWant []string
	}{
		{
			name: "root",
			args: []string{"--help"},
			want: []string{"usage: laf-bridge pair", "Settings -> LAF Bridge"},
			notWant: []string{
				"start",
				"status",
				"doctor",
				"providers",
				"mcp-context",
				"bindings",
				"link-project",
				"unlink-project",
			},
		},
		{
			name: "pair",
			args: []string{"pair", "--help"},
			want: []string{"usage: laf-bridge pair", "setup code", "Settings -> LAF Bridge"},
			notWant: []string{
				"status",
				"doctor",
				"providers",
				"-api-url",
				"-code",
				"-identity-path",
				"-once",
				"-public-key",
				"-start",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if err := run(tt.args, &stdout, &stderr); err != nil {
				t.Fatalf("help returned error: %v stderr=%s", err, stderr.String())
			}
			output := stdout.String()
			for _, want := range tt.want {
				if !strings.Contains(output, want) {
					t.Fatalf("help output missing %q: %s", want, output)
				}
			}
			for _, notWant := range tt.notWant {
				if strings.Contains(output, notWant) {
					t.Fatalf("help output exposed %q: %s", notWant, output)
				}
			}
		})
	}
}

func TestRunVersionExitsCleanly(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if err := run([]string{"--version"}, &stdout, &stderr); err != nil {
		t.Fatalf("version returned error: %v stderr=%s", err, stderr.String())
	}
	want := "laf-bridge v" + buildinfo.Current().Version
	if got := strings.TrimSpace(stdout.String()); got != want {
		t.Fatalf("version output: got %q want %q", got, want)
	}
}

func TestResolvePairInputsPrefersSetupCodeAPIURL(t *testing.T) {
	t.Setenv("LAF_BRIDGE_API_URL", "https://stale.example.com/api")
	t.Setenv("LAF_HOSTED_API_URL", "https://also-stale.example.com/api")
	setupCode := bridgeSetupCodeForTest("https://office.example.com/api", "PAIR-CODE")

	apiURL, code, err := resolvePairInputs("", "", strings.NewReader(setupCode+"\n"), io.Discard)
	if err != nil {
		t.Fatalf("resolve pair inputs: %v", err)
	}
	if apiURL != "https://office.example.com/api" {
		t.Fatalf("apiURL = %q, want setup-code API URL", apiURL)
	}
	if code != "PAIR-CODE" {
		t.Fatalf("code = %q", code)
	}

	flagAPIURL, flagCode, err := resolvePairInputs(
		"https://manual.example.com/api",
		setupCode,
		nil,
		io.Discard,
	)
	if err != nil {
		t.Fatalf("resolve pair flag setup code: %v", err)
	}
	if flagAPIURL != "https://office.example.com/api" {
		t.Fatalf("flag apiURL = %q, want setup-code API URL", flagAPIURL)
	}
	if flagCode != "PAIR-CODE" {
		t.Fatalf("flag code = %q", flagCode)
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
		switch r.Method + " " + r.URL.Path {
		case "POST /bridge/devices/device-1/heartbeat":
			_ = json.NewEncoder(w).Encode(map[string]any{"device": map[string]any{
				"id":     "device-1",
				"status": "online",
			}})
			return
		case "GET /bridge/devices/device-1/pending-plans":
		default:
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

func TestRunPairStartsBridgeLoopWhenOnceRequested(t *testing.T) {
	var sawPairClaim bool
	var sawHeartbeat bool
	var sawPending bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "POST /bridge/pairing/claim":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode claim: %v", err)
			}
			if body["code"] != "PAIR-CODE" {
				t.Fatalf("pairing code = %v", body["code"])
			}
			sawPairClaim = true
			_ = json.NewEncoder(w).Encode(map[string]any{
				"bridge_token":            "bridge-token",
				"plan_signing_public_key": testPlanSigningPublicKey(),
				"device": map[string]any{
					"device_label": "Local Test",
					"id":           "device-1",
					"status":       "online",
					"team_id":      "team-1",
					"user_id":      "user-1",
				},
			})
		case "POST /bridge/devices/device-1/heartbeat":
			if got := r.Header.Get("Authorization"); got != "Bearer bridge-token" {
				t.Fatalf("heartbeat authorization = %q", got)
			}
			sawHeartbeat = true
			_ = json.NewEncoder(w).Encode(map[string]any{"device": map[string]any{
				"id":     "device-1",
				"status": "online",
			}})
		case "GET /bridge/devices/device-1/pending-plans":
			if got := r.Header.Get("Authorization"); got != "Bearer bridge-token" {
				t.Fatalf("pending authorization = %q", got)
			}
			sawPending = true
			_ = json.NewEncoder(w).Encode(map[string]any{"plans": []bridge.ExecutionPlan{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	dir := t.TempDir()
	t.Setenv(product.Env("BRIDGE_CONFIG_PATH"), filepath.Join(dir, "config.json"))
	t.Setenv(product.Env("BRIDGE_TOKEN_PATH"), filepath.Join(dir, "token"))

	var stdout, stderr bytes.Buffer
	setupCode := bridgeSetupCodeForTest(server.URL, "PAIR-CODE")
	err := runWithContextIO(context.Background(), []string{
		"pair",
		"--device-label", "Local Test",
		"--once=true",
	}, strings.NewReader(setupCode+"\n"), &stdout, &stderr)
	if err != nil {
		t.Fatalf("pair: %v stderr=%s", err, stderr.String())
	}
	if !strings.Contains(stdout.String(), "paired device device-1") {
		t.Fatalf("pair output missing device id: %s", stdout.String())
	}
	if !sawPairClaim || !sawHeartbeat || !sawPending {
		t.Fatalf("pair did not run full loop: claim=%v heartbeat=%v pending=%v", sawPairClaim, sawHeartbeat, sawPending)
	}
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIURL != server.URL || cfg.DeviceID != "device-1" {
		t.Fatalf("saved config = %#v", cfg)
	}
}

func TestRunPairAutoApprovesWorkspaceWritePlan(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	planSigningPublicKey := base64.StdEncoding.EncodeToString(pub)

	plan := signedBridgePlan(priv, func(plan *bridge.ExecutionPlan) {
		plan.Provider = "fake"
		plan.Policy = json.RawMessage(`{"sandbox":"workspace-write"}`)
	})

	var sawApprovedStart bool
	var sawEvent bool
	var sawComplete bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "POST /bridge/pairing/claim":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"bridge_token":            "bridge-token",
				"plan_signing_public_key": planSigningPublicKey,
				"device": map[string]any{
					"device_label": "Auto Approve",
					"id":           "device-1",
					"status":       "online",
					"team_id":      "team-1",
					"user_id":      "user-1",
				},
			})
		case "POST /bridge/devices/device-1/heartbeat":
			_ = json.NewEncoder(w).Encode(map[string]any{"device": map[string]any{
				"id":     "device-1",
				"status": "online",
			}})
		case "GET /bridge/devices/device-1/pending-plans":
			_ = json.NewEncoder(w).Encode(map[string]any{"plans": []bridge.ExecutionPlan{plan}})
		case "POST /execution/plans/plan-1/ack":
			_ = json.NewEncoder(w).Encode(map[string]any{"plan": plan})
		case "POST /execution/plans/plan-1/start":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode start body: %v", err)
			}
			if body["local_approval_status"] != bridge.LocalApprovalApproved {
				t.Fatalf("local approval status = %v", body["local_approval_status"])
			}
			sawApprovedStart = true
			_ = json.NewEncoder(w).Encode(map[string]any{"plan": plan})
		case "POST /execution/plans/plan-1/events":
			sawEvent = true
			_ = json.NewEncoder(w).Encode(map[string]any{"event": bridge.ExecutionEvent{
				ID:        "event-1",
				TeamID:    "team-1",
				PlanID:    "plan-1",
				Sequence:  1,
				EventType: "bridge.fake_execution",
			}})
		case "POST /execution/plans/plan-1/complete":
			sawComplete = true
			_ = json.NewEncoder(w).Encode(map[string]any{
				"plan": plan,
				"receipt": bridge.ExecutionReceipt{
					ID:       "receipt-1",
					TeamID:   "team-1",
					PlanID:   "plan-1",
					Status:   "completed",
					Provider: "fake",
					Summary:  "done",
				},
			})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	dir := t.TempDir()
	t.Setenv(product.Env("BRIDGE_CONFIG_PATH"), filepath.Join(dir, "config.json"))
	t.Setenv(product.Env("BRIDGE_TOKEN_PATH"), filepath.Join(dir, "token"))

	var stdout, stderr bytes.Buffer
	err = runWithContextIO(context.Background(), []string{
		"pair",
		"--device-label", "Auto Approve",
		"--once=true",
	}, strings.NewReader(bridgeSetupCodeForTest(server.URL, "PAIR-CODE")+"\n"), &stdout, &stderr)
	if err != nil {
		t.Fatalf("pair auto approve: %v stderr=%s stdout=%s", err, stderr.String(), stdout.String())
	}
	cfg, err := bridge.LoadConfig("")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.PlanSigningPublicKey != planSigningPublicKey {
		t.Fatalf("pair did not persist plan signing public key: %#v", cfg)
	}
	if !sawApprovedStart || !sawEvent || !sawComplete {
		t.Fatalf("pair did not execute approved plan: start=%v event=%v complete=%v", sawApprovedStart, sawEvent, sawComplete)
	}
}

func TestRunPairStartsDaemonLoopByDefault(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	seenPending := make(chan struct{}, 1)
	var sawPairClaim bool
	var sawHeartbeat bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "POST /bridge/pairing/claim":
			sawPairClaim = true
			_ = json.NewEncoder(w).Encode(map[string]any{
				"bridge_token":            "bridge-token",
				"plan_signing_public_key": testPlanSigningPublicKey(),
				"device": map[string]any{
					"device_label": "Default Loop",
					"id":           "device-1",
					"status":       "online",
					"team_id":      "team-1",
					"user_id":      "user-1",
				},
			})
		case "POST /bridge/devices/device-1/heartbeat":
			if got := r.Header.Get("Authorization"); got != "Bearer bridge-token" {
				t.Fatalf("heartbeat authorization = %q", got)
			}
			sawHeartbeat = true
			_ = json.NewEncoder(w).Encode(map[string]any{"device": map[string]any{
				"id":     "device-1",
				"status": "online",
			}})
		case "GET /bridge/devices/device-1/pending-plans":
			if got := r.Header.Get("Authorization"); got != "Bearer bridge-token" {
				t.Fatalf("pending authorization = %q", got)
			}
			select {
			case seenPending <- struct{}{}:
			default:
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"plans": []bridge.ExecutionPlan{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	go func() {
		<-seenPending
		time.Sleep(5 * time.Millisecond)
		cancel()
	}()

	dir := t.TempDir()
	t.Setenv(product.Env("BRIDGE_CONFIG_PATH"), filepath.Join(dir, "config.json"))
	t.Setenv(product.Env("BRIDGE_TOKEN_PATH"), filepath.Join(dir, "token"))

	var stdout, stderr bytes.Buffer
	err := runWithContextIO(ctx, []string{
		"pair",
		"--device-label", "Default Loop",
	}, strings.NewReader(bridgeSetupCodeForTest(server.URL, "PAIR-CODE")+"\n"), &stdout, &stderr)
	if err != nil {
		t.Fatalf("pair default loop: %v stderr=%s", err, stderr.String())
	}
	if !strings.Contains(stdout.String(), "laf-bridge polling device device-1") {
		t.Fatalf("pair default output missing polling status: %s", stdout.String())
	}
	if !sawPairClaim || !sawHeartbeat {
		t.Fatalf("pair default did not run bridge loop: claim=%v heartbeat=%v", sawPairClaim, sawHeartbeat)
	}
}

func signedBridgePlan(priv ed25519.PrivateKey, mutate func(*bridge.ExecutionPlan)) bridge.ExecutionPlan {
	plan := bridge.ExecutionPlan{
		ID:                   "plan-1",
		TeamID:               "team-1",
		ActorUserID:          "actor-1",
		ExecutorUserID:       strPtr("user-1"),
		DeviceID:             strPtr("device-1"),
		Mode:                 "my_bridge",
		Provider:             "fake",
		RequiredPermissions:  json.RawMessage(`[]`),
		EffectivePermissions: json.RawMessage(`["task:execute_agent"]`),
		ContextRefs:          json.RawMessage(`[]`),
		Prompt:               "Implement the task",
		Policy:               json.RawMessage(`{}`),
		ExpiresAt:            "2099-01-01T00:00:00Z",
		SignatureAlg:         "ed25519",
		SignatureKeyID:       "test-key",
		Nonce:                "nonce-1",
		Status:               "pending",
	}
	mutate(&plan)
	payload := bridge.CanonicalPlanPayload(plan)
	sum := sha256.Sum256(payload)
	plan.PayloadHash = hex.EncodeToString(sum[:])
	plan.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, payload))
	return plan
}

func testPlanSigningPublicKey() string {
	return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, ed25519.PublicKeySize))
}

func bridgeSetupCodeForTest(apiURL string, code string) string {
	payload, _ := json.Marshal(map[string]any{
		"api_url": apiURL,
		"code":    code,
		"v":       1,
	})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func strPtr(value string) *string {
	return &value
}
