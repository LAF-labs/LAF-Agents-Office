package bridge

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/buildinfo"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

func TestStoreTokenFallbackUses0600Permissions(t *testing.T) {
	t.Setenv(product.Env("RUNTIME_HOME"), t.TempDir())
	ref, err := StoreTokenFallback("", "laf_bridge_test_token")
	if err != nil {
		t.Fatal(err)
	}
	token, err := ResolveToken(Config{TokenRef: ref})
	if err != nil {
		t.Fatal(err)
	}
	if token != "laf_bridge_test_token" {
		t.Fatalf("token mismatch: got %q", token)
	}
	info, err := os.Stat(TokenPath())
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("token file mode: got %o want 0600", got)
	}
}

func TestPairStoresTokenReferenceAndDeviceID(t *testing.T) {
	tmp := t.TempDir()
	configPath := filepath.Join(tmp, "config.json")
	identityPath := filepath.Join(tmp, "identity.pem")
	tokenPath := filepath.Join(tmp, "token")
	planPub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	planSigningPublicKey := base64.StdEncoding.EncodeToString(planPub)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/bridge/pairing/claim" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["code"] != "ABCD-EFGH-IJKL" {
			t.Fatalf("pairing code not forwarded: %#v", body["code"])
		}
		if body["public_key"] == "" || body["public_key"] == "laf-bridge-local-public-key-pending" {
			t.Fatalf("pairing public key was not generated: %#v", body["public_key"])
		}
		if body["device_kind"] != "desktop" {
			t.Fatalf("pairing device_kind: got %#v want desktop", body["device_kind"])
		}
		if body["bridge_version"] != buildinfo.Current().Version {
			t.Fatalf("pairing bridge_version: got %#v want %#v", body["bridge_version"], buildinfo.Current().Version)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"bridge_token":            "laf_bridge_pair_token",
			"plan_signing_key_id":     "test-plan-key",
			"plan_signing_public_key": planSigningPublicKey,
			"device": map[string]any{
				"id":           "device-1",
				"team_id":      "team-1",
				"user_id":      "user-1",
				"device_label": "Test Mac",
				"device_kind":  "desktop",
				"status":       "online",
			},
		})
	}))
	defer server.Close()

	cfg, err := Pair(context.Background(), PairOptions{
		APIURL:       server.URL,
		Code:         "ABCD-EFGH-IJKL",
		ConfigPath:   configPath,
		DeviceLabel:  "Test Mac",
		IdentityPath: identityPath,
		Detector: ProviderDetector{
			LookPath: func(string) (string, error) { return "/bin/codex", nil },
			Version:  func(context.Context, string) (string, error) { return "codex 1.2.3", nil },
		},
		TokenPath: tokenPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DeviceID != "device-1" || cfg.TeamID != "team-1" || cfg.UserID != "user-1" {
		t.Fatalf("unexpected config after pair: %#v", cfg)
	}
	if cfg.TokenRef != fileTokenPrefix+tokenPath {
		t.Fatalf("token ref: got %q", cfg.TokenRef)
	}
	if cfg.IdentityRef != fileTokenPrefix+identityPath {
		t.Fatalf("identity ref: got %q", cfg.IdentityRef)
	}
	if cfg.PublicKey == "" {
		t.Fatal("public key was not persisted")
	}
	if cfg.PlanSigningPublicKey != planSigningPublicKey {
		t.Fatalf("plan signing public key was not persisted: %#v", cfg)
	}
	identityInfo, err := os.Stat(identityPath)
	if err != nil {
		t.Fatal(err)
	}
	if got := identityInfo.Mode().Perm(); got != 0o600 {
		t.Fatalf("identity file mode: got %o want 0600", got)
	}
	saved, err := LoadConfig(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if saved.DeviceID != "device-1" {
		t.Fatalf("saved config missing device id: %#v", saved)
	}
	if saved.PlanSigningPublicKey != planSigningPublicKey {
		t.Fatalf("saved config missing plan signing public key: %#v", saved)
	}
	token, err := ResolveToken(saved)
	if err != nil {
		t.Fatal(err)
	}
	if token != "laf_bridge_pair_token" {
		t.Fatalf("stored token: got %q", token)
	}
}

func TestHeartbeatSendsBuildInfoVersion(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/bridge/devices/device-1/heartbeat" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatal(err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"device": map[string]any{
				"id":           "device-1",
				"device_kind":  "desktop",
				"device_label": "Test Bridge",
				"status":       "online",
			},
		})
	}))
	defer server.Close()

	client := Client{APIURL: server.URL}
	if _, err := client.Heartbeat(context.Background(), Config{
		DeviceID:    "device-1",
		DeviceLabel: "Test Bridge",
	}, Capabilities{}); err != nil {
		t.Fatal(err)
	}
	if got["bridge_version"] != buildinfo.Current().Version {
		t.Fatalf("heartbeat bridge_version: got %#v want %#v", got["bridge_version"], buildinfo.Current().Version)
	}
}
