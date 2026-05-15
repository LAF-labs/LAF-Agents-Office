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
	identityPath := filepath.Join(tmp, "identity.pem")
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
		if body["public_key"] == "" || body["public_key"] == "laf-bridge-local-public-key-pending" {
			t.Fatalf("pairing public key was not generated: %#v", body["public_key"])
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
	token, err := ResolveToken(saved)
	if err != nil {
		t.Fatal(err)
	}
	if token != "laf_bridge_pair_token" {
		t.Fatalf("stored token: got %q", token)
	}
}

func TestUpsertAndRemoveProjectBinding(t *testing.T) {
	cfg := Config{DeviceID: "device-1"}
	var err error
	cfg, err = UpsertProjectBinding(cfg, ProjectBinding{
		ID:        "binding-1",
		LocalPath: "/work/project",
		Trusted:   true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Bindings) != 1 {
		t.Fatalf("binding count: got %d", len(cfg.Bindings))
	}
	if cfg.Bindings[0].DeviceID != "device-1" {
		t.Fatalf("binding device default not applied: %#v", cfg.Bindings[0])
	}
	cfg, err = UpsertProjectBinding(cfg, ProjectBinding{
		ID:        "binding-1",
		LocalPath: "/work/project-renamed",
		Trusted:   false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Bindings) != 1 || cfg.Bindings[0].LocalPath != "/work/project-renamed" {
		t.Fatalf("binding was not replaced: %#v", cfg.Bindings)
	}
	cfg, removed := RemoveProjectBinding(cfg, "binding-1")
	if !removed {
		t.Fatal("expected binding to be removed")
	}
	if len(cfg.Bindings) != 0 {
		t.Fatalf("binding count after remove: %d", len(cfg.Bindings))
	}
}
