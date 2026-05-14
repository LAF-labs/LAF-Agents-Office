package bridge

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

const fileTokenPrefix = "file:"

// Config is the local desktop bridge configuration stored under
// ~/.laf-office/bridge/config.json by default.
type Config struct {
	APIURL      string           `json:"api_url"`
	DeviceID    string           `json:"device_id"`
	DeviceLabel string           `json:"device_label,omitempty"`
	TeamID      string           `json:"team_id,omitempty"`
	UserID      string           `json:"user_id,omitempty"`
	TokenRef    string           `json:"token_ref,omitempty"`
	Bindings    []ProjectBinding `json:"bindings,omitempty"`
}

// ProjectBinding maps a hosted project binding to a trusted local path.
type ProjectBinding struct {
	ID          string `json:"id"`
	ProjectID   string `json:"project_id"`
	DeviceID    string `json:"device_id"`
	DisplayName string `json:"display_name,omitempty"`
	LocalPath   string `json:"local_path"`
	Trusted     bool   `json:"trusted"`
}

func RuntimeHomeDir() string {
	if v := strings.TrimSpace(os.Getenv(product.Env("RUNTIME_HOME"))); v != "" {
		return v
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return home
}

func ConfigPath() string {
	if p := strings.TrimSpace(os.Getenv(product.Env("BRIDGE_CONFIG_PATH"))); p != "" {
		return p
	}
	return product.RuntimePath(RuntimeHomeDir(), "bridge", "config.json")
}

func TokenPath() string {
	if p := strings.TrimSpace(os.Getenv(product.Env("BRIDGE_TOKEN_PATH"))); p != "" {
		return p
	}
	return product.RuntimePath(RuntimeHomeDir(), "bridge", "token")
}

func LoadConfig(path string) (Config, error) {
	if strings.TrimSpace(path) == "" {
		path = ConfigPath()
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Config{}, nil
		}
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func SaveConfig(path string, cfg Config) error {
	if strings.TrimSpace(path) == "" {
		path = ConfigPath()
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o600)
}

func StoreTokenFallback(path, token string) (string, error) {
	if strings.TrimSpace(path) == "" {
		path = TokenPath()
	}
	if strings.TrimSpace(token) == "" {
		return "", errors.New("bridge token is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil {
		return "", err
	}
	return fileTokenPrefix + path, nil
}

func ResolveToken(cfg Config) (string, error) {
	ref := strings.TrimSpace(cfg.TokenRef)
	if ref == "" {
		return "", errors.New("bridge token reference is not configured")
	}
	if strings.HasPrefix(ref, fileTokenPrefix) {
		data, err := os.ReadFile(strings.TrimPrefix(ref, fileTokenPrefix))
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(data)), nil
	}
	return ref, nil
}
