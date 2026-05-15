package bridge

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const defaultSupabaseRelayTopicPrefix = "bridge:device:"

// SupabaseRelaySource subscribes to Supabase Realtime Broadcast messages.
// Broadcasts are only hints; the bridge still pulls durable pending plans.
type SupabaseRelaySource struct {
	URL               string
	APIKey            string
	TopicPrefix       string
	HeartbeatInterval time.Duration
	Dialer            *websocket.Dialer
}

func SupabaseRelaySourceFromEnv() *SupabaseRelaySource {
	baseURL := firstRelayEnv(
		"LAF_BRIDGE_RELAY_URL",
		"LAF_BRIDGE_SUPABASE_URL",
		"SUPABASE_URL",
		"VITE_SUPABASE_URL",
	)
	apiKey := firstRelayEnv(
		"LAF_BRIDGE_RELAY_ANON_KEY",
		"LAF_BRIDGE_SUPABASE_ANON_KEY",
		"SUPABASE_ANON_KEY",
		"VITE_SUPABASE_ANON_KEY",
	)
	if baseURL == "" || apiKey == "" {
		return nil
	}
	return &SupabaseRelaySource{URL: baseURL, APIKey: apiKey}
}

func (s SupabaseRelaySource) Subscribe(ctx context.Context, deviceID string) (<-chan RelayHint, error) {
	deviceID = strings.TrimSpace(deviceID)
	if deviceID == "" {
		return nil, errors.New("bridge device id is required")
	}
	wsURL, err := supabaseRealtimeWebSocketURL(s.URL, s.APIKey)
	if err != nil {
		return nil, err
	}
	dialer := s.Dialer
	if dialer == nil {
		dialer = websocket.DefaultDialer
	}
	headers := http.Header{}
	headers.Set("apikey", s.APIKey)
	headers.Set("Authorization", "Bearer "+s.APIKey)
	conn, _, err := dialer.DialContext(ctx, wsURL, headers)
	if err != nil {
		return nil, err
	}

	var (
		refMu sync.Mutex
		ref   int
	)
	nextRef := func() string {
		refMu.Lock()
		defer refMu.Unlock()
		ref++
		return strconv.Itoa(ref)
	}
	writeMu := sync.Mutex{}
	writeJSON := func(v any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteJSON(v)
	}

	topic := s.topic(deviceID)
	if err := writeJSON(phoenixMessage{
		Topic: topic,
		Event: "phx_join",
		Payload: map[string]any{
			"config": map[string]any{
				"broadcast": map[string]any{
					"ack":  false,
					"self": false,
				},
				"presence": map[string]any{"key": ""},
			},
		},
		Ref: nextRef(),
	}); err != nil {
		_ = conn.Close()
		return nil, err
	}

	hints := make(chan RelayHint, 16)
	done := make(chan struct{})
	go func() {
		defer close(done)
		defer close(hints)
		defer conn.Close()
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			hint, ok := decodeSupabaseRelayHint(data)
			if !ok {
				continue
			}
			select {
			case <-ctx.Done():
				return
			case hints <- hint:
			}
		}
	}()

	heartbeatInterval := s.HeartbeatInterval
	if heartbeatInterval <= 0 {
		heartbeatInterval = 25 * time.Second
	}
	go func() {
		ticker := time.NewTicker(heartbeatInterval)
		defer ticker.Stop()
		defer conn.Close()
		for {
			select {
			case <-ctx.Done():
				return
			case <-done:
				return
			case <-ticker.C:
				if err := writeJSON(phoenixMessage{
					Topic:   "phoenix",
					Event:   "heartbeat",
					Payload: map[string]any{},
					Ref:     nextRef(),
				}); err != nil {
					return
				}
			}
		}
	}()

	go func() {
		<-ctx.Done()
		_ = conn.Close()
	}()

	return hints, nil
}

func (s SupabaseRelaySource) topic(deviceID string) string {
	prefix := strings.TrimSpace(s.TopicPrefix)
	if prefix == "" {
		prefix = defaultSupabaseRelayTopicPrefix
	}
	return prefix + strings.TrimSpace(deviceID)
}

type phoenixMessage struct {
	Topic   string `json:"topic"`
	Event   string `json:"event"`
	Payload any    `json:"payload"`
	Ref     string `json:"ref,omitempty"`
}

func supabaseRealtimeWebSocketURL(rawURL, apiKey string) (string, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", errors.New("supabase relay url is required")
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", errors.New("supabase relay url must use http, https, ws, or wss")
	}
	u.Path = strings.TrimRight(u.Path, "/")
	if u.Path == "" || strings.HasSuffix(u.Path, "/api/broadcast") || strings.HasSuffix(u.Path, "/broadcast") {
		u.Path = "/realtime/v1/websocket"
	}
	q := u.Query()
	if strings.TrimSpace(apiKey) != "" {
		q.Set("apikey", strings.TrimSpace(apiKey))
	}
	if q.Get("vsn") == "" {
		q.Set("vsn", "1.0.0")
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func decodeSupabaseRelayHint(data []byte) (RelayHint, bool) {
	event, payload, ok := decodePhoenixPayload(data)
	if !ok {
		return RelayHint{}, false
	}
	if event == "broadcast" {
		var envelope struct {
			Event   string          `json:"event"`
			Payload json.RawMessage `json:"payload"`
			Type    string          `json:"type"`
		}
		if err := json.Unmarshal(payload, &envelope); err != nil {
			return RelayHint{}, false
		}
		if strings.TrimSpace(envelope.Type) != "" && envelope.Type != "broadcast" {
			return RelayHint{}, false
		}
		event = strings.TrimSpace(envelope.Event)
		payload = envelope.Payload
	}
	event = strings.TrimSpace(event)
	if event == "" || len(payload) == 0 || string(payload) == "null" {
		return RelayHint{}, false
	}
	var body map[string]any
	if err := json.Unmarshal(payload, &body); err != nil {
		return RelayHint{}, false
	}
	return RelayHint{
		Event:   event,
		PlanID:  stringPayloadField(body, "plan_id", "id"),
		Payload: body,
	}, true
}

func decodePhoenixPayload(data []byte) (string, json.RawMessage, bool) {
	var msg struct {
		Event   string          `json:"event"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.Unmarshal(data, &msg); err == nil && msg.Event != "" {
		return msg.Event, msg.Payload, true
	}
	var parts []json.RawMessage
	if err := json.Unmarshal(data, &parts); err != nil || len(parts) < 5 {
		return "", nil, false
	}
	var event string
	if err := json.Unmarshal(parts[3], &event); err != nil {
		return "", nil, false
	}
	return event, parts[4], true
}

func stringPayloadField(body map[string]any, names ...string) string {
	for _, name := range names {
		switch v := body[name].(type) {
		case string:
			if strings.TrimSpace(v) != "" {
				return strings.TrimSpace(v)
			}
		}
	}
	return ""
}

func firstRelayEnv(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}
