package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"time"
)

type Client struct {
	APIURL     string
	Token      string
	HTTPClient *http.Client
}

type Device struct {
	ID           string       `json:"id"`
	TeamID       string       `json:"team_id"`
	UserID       string       `json:"user_id"`
	DeviceLabel  string       `json:"device_label"`
	DeviceKind   string       `json:"device_kind"`
	Platform     string       `json:"platform,omitempty"`
	Arch         string       `json:"arch,omitempty"`
	Status       string       `json:"status"`
	Capabilities Capabilities `json:"capabilities,omitempty"`
}

type PairOptions struct {
	APIURL      string
	Code        string
	DeviceLabel string
	PublicKey   string
	ConfigPath  string
	TokenPath   string
	Detector    ProviderDetector
}

type claimPairingResponse struct {
	BridgeToken string `json:"bridge_token"`
	Device      Device `json:"device"`
}

func Pair(ctx context.Context, opts PairOptions) (Config, error) {
	if strings.TrimSpace(opts.APIURL) == "" {
		return Config{}, fmt.Errorf("api url is required")
	}
	if strings.TrimSpace(opts.Code) == "" {
		return Config{}, fmt.Errorf("pairing code is required")
	}
	label := strings.TrimSpace(opts.DeviceLabel)
	if label == "" {
		hostname, _ := os.Hostname()
		label = strings.TrimSpace(hostname)
	}
	if label == "" {
		label = "Desktop Bridge"
	}
	publicKey := strings.TrimSpace(opts.PublicKey)
	if publicKey == "" {
		publicKey = "laf-bridge-local-public-key-pending"
	}
	caps := DetectCapabilities(ctx, opts.Detector)
	client := Client{APIURL: opts.APIURL}
	var out claimPairingResponse
	if err := client.post(ctx, "/bridge/pairing/claim", map[string]any{
		"arch":           runtime.GOARCH,
		"bridge_version": "dev",
		"capabilities":   caps,
		"code":           opts.Code,
		"device_kind":    "desktop",
		"device_label":   label,
		"platform":       runtime.GOOS,
		"public_key":     publicKey,
	}, &out); err != nil {
		return Config{}, err
	}
	tokenRef, err := StoreTokenFallback(opts.TokenPath, out.BridgeToken)
	if err != nil {
		return Config{}, err
	}
	cfg, err := LoadConfig(opts.ConfigPath)
	if err != nil {
		return Config{}, err
	}
	cfg.APIURL = normalizeAPIURL(opts.APIURL)
	cfg.DeviceID = out.Device.ID
	cfg.DeviceLabel = out.Device.DeviceLabel
	cfg.TeamID = out.Device.TeamID
	cfg.UserID = out.Device.UserID
	cfg.TokenRef = tokenRef
	if err := SaveConfig(opts.ConfigPath, cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Client) PendingPlans(ctx context.Context, deviceID string) ([]ExecutionPlan, error) {
	var out struct {
		Plans []ExecutionPlan `json:"plans"`
	}
	err := c.get(ctx, "/bridge/devices/"+url.PathEscape(deviceID)+"/pending-plans", &out)
	return out.Plans, err
}

func (c Client) post(ctx context.Context, path string, in, out any) error {
	return c.do(ctx, http.MethodPost, path, in, out)
}

func (c Client) get(ctx context.Context, path string, out any) error {
	return c.do(ctx, http.MethodGet, path, nil, out)
}

func (c Client) do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader = http.NoBody
	if in != nil {
		data, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, normalizeAPIURL(c.APIURL)+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(c.Token) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(c.Token))
	}
	httpClient := c.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 20 * time.Second}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var apiErr struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&apiErr)
		if apiErr.Error != "" {
			return fmt.Errorf("api %s %s: %s", method, path, apiErr.Error)
		}
		return fmt.Errorf("api %s %s: %s", method, path, resp.Status)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func normalizeAPIURL(raw string) string {
	return strings.TrimRight(strings.TrimSpace(raw), "/")
}
