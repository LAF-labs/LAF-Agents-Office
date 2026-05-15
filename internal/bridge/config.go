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
	APIURL               string           `json:"api_url"`
	DeviceID             string           `json:"device_id"`
	DeviceLabel          string           `json:"device_label,omitempty"`
	TeamID               string           `json:"team_id,omitempty"`
	UserID               string           `json:"user_id,omitempty"`
	TokenRef             string           `json:"token_ref,omitempty"`
	IdentityRef          string           `json:"identity_ref,omitempty"`
	PublicKey            string           `json:"public_key,omitempty"`
	PlanSigningPublicKey string           `json:"plan_signing_public_key,omitempty"`
	Bindings             []ProjectBinding `json:"bindings,omitempty"`
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

func IdentityPath() string {
	if p := strings.TrimSpace(os.Getenv(product.Env("BRIDGE_IDENTITY_PATH"))); p != "" {
		return p
	}
	return product.RuntimePath(RuntimeHomeDir(), "bridge", "identity.pem")
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

func UpsertProjectBinding(cfg Config, binding ProjectBinding) (Config, error) {
	binding.ID = strings.TrimSpace(binding.ID)
	binding.ProjectID = strings.TrimSpace(binding.ProjectID)
	binding.DeviceID = strings.TrimSpace(binding.DeviceID)
	binding.DisplayName = strings.TrimSpace(binding.DisplayName)
	binding.LocalPath = strings.TrimSpace(binding.LocalPath)
	if binding.ID == "" {
		return Config{}, errors.New("binding id is required")
	}
	if binding.LocalPath == "" {
		return Config{}, errors.New("local path is required")
	}
	if binding.DeviceID == "" {
		binding.DeviceID = cfg.DeviceID
	}
	replaced := false
	for i, existing := range cfg.Bindings {
		if existing.ID == binding.ID {
			cfg.Bindings[i] = binding
			replaced = true
			break
		}
	}
	if !replaced {
		cfg.Bindings = append(cfg.Bindings, binding)
	}
	return cfg, nil
}

func RemoveProjectBinding(cfg Config, bindingID string) (Config, bool) {
	bindingID = strings.TrimSpace(bindingID)
	if bindingID == "" {
		return cfg, false
	}
	filtered := cfg.Bindings[:0]
	removed := false
	for _, binding := range cfg.Bindings {
		if binding.ID == bindingID {
			removed = true
			continue
		}
		filtered = append(filtered, binding)
	}
	cfg.Bindings = filtered
	return cfg, removed
}

func (cfg Config) BindingForPlan(plan ExecutionPlan) ProjectBinding {
	if plan.BindingID == nil {
		return ProjectBinding{}
	}
	for _, binding := range cfg.Bindings {
		if binding.ID == *plan.BindingID {
			return binding
		}
	}
	return ProjectBinding{}
}
