package bridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestSupabaseRealtimeWebSocketURL(t *testing.T) {
	got, err := supabaseRealtimeWebSocketURL(
		"https://supabase.test/realtime/v1/api/broadcast",
		"anon-key",
	)
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	if u.Scheme != "wss" || u.Host != "supabase.test" || u.Path != "/realtime/v1/websocket" {
		t.Fatalf("unexpected websocket URL: %s", got)
	}
	if u.Query().Get("apikey") != "anon-key" || u.Query().Get("vsn") != "1.0.0" {
		t.Fatalf("unexpected websocket query: %s", got)
	}
}

func TestDecodeSupabaseRelayHint(t *testing.T) {
	hint, ok := decodeSupabaseRelayHint([]byte(`{
		"topic":"bridge:device:device-1",
		"event":"broadcast",
		"payload":{
			"type":"broadcast",
			"event":"execution.plan.created",
			"payload":{"plan_id":"plan-1","team_id":"team-1"}
		},
		"ref":"2"
	}`))
	if !ok {
		t.Fatal("expected relay hint")
	}
	if hint.Event != "execution.plan.created" || hint.PlanID != "plan-1" {
		t.Fatalf("unexpected hint: %#v", hint)
	}
}

func TestDecodeSupabaseRelayHintPhoenixArray(t *testing.T) {
	hint, ok := decodeSupabaseRelayHint([]byte(`[
		null,
		"2",
		"bridge:device:device-1",
		"broadcast",
		{
			"type":"broadcast",
			"event":"execution.plan.created",
			"payload":{"plan_id":"plan-1"}
		}
	]`))
	if !ok {
		t.Fatal("expected relay hint")
	}
	if hint.Event != "execution.plan.created" || hint.PlanID != "plan-1" {
		t.Fatalf("unexpected hint: %#v", hint)
	}
}

func TestSupabaseRelaySourceSubscribesAndEmitsHints(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	joins := make(chan phoenixMessage, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/realtime/v1/websocket" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("apikey") != "anon-key" || r.Header.Get("Authorization") != "Bearer anon-key" {
			t.Fatalf("missing relay auth: query=%s auth=%q", r.URL.RawQuery, r.Header.Get("Authorization"))
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade: %v", err)
		}
		defer conn.Close()
		var join phoenixMessage
		if err := conn.ReadJSON(&join); err != nil {
			t.Fatalf("read join: %v", err)
		}
		joins <- join
		if err := conn.WriteJSON(map[string]any{
			"topic": "bridge:device:device-1",
			"event": "broadcast",
			"payload": map[string]any{
				"type":  "broadcast",
				"event": "execution.plan.created",
				"payload": map[string]any{
					"plan_id": "plan-1",
				},
			},
		}); err != nil {
			t.Fatalf("write broadcast: %v", err)
		}
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	source := SupabaseRelaySource{
		URL:               server.URL,
		APIKey:            "anon-key",
		HeartbeatInterval: time.Hour,
	}
	hints, err := source.Subscribe(ctx, "device-1")
	if err != nil {
		t.Fatal(err)
	}

	select {
	case join := <-joins:
		if join.Topic != "bridge:device:device-1" || join.Event != "phx_join" {
			data, _ := json.Marshal(join)
			t.Fatalf("unexpected join: %s", data)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for join")
	}

	select {
	case hint := <-hints:
		if hint.Event != "execution.plan.created" || hint.PlanID != "plan-1" {
			t.Fatalf("unexpected hint: %#v", hint)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for hint")
	}
}
