package bridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

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
	tokenPath := filepath.Join(tmp, "token")
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
		_ = json.NewEncoder(w).Encode(map[string]any{
			"bridge_token": "laf_bridge_pair_token",
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
		APIURL:      server.URL,
		Code:        "ABCD-EFGH-IJKL",
		ConfigPath:  configPath,
		DeviceLabel: "Test Mac",
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
	saved, err := LoadConfig(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if saved.DeviceID != "device-1" {
		t.Fatalf("saved config missing device id: %#v", saved)
	}
	token, err := ResolveToken(saved)
	if err != nil {
		t.Fatal(err)
	}
	if token != "laf_bridge_pair_token" {
		t.Fatalf("stored token: got %q", token)
	}
}
