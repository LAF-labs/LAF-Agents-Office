package bridge

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestRunPendingOnceValidatesAndCompletesFakeExecution(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	plan := signedPlan(priv, func(plan *ExecutionPlan) {})
	var calls []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer bridge-token" {
			t.Fatalf("missing bridge authorization header: %q", r.Header.Get("Authorization"))
		}
		calls = append(calls, r.Method+" "+r.URL.Path)
		switch r.Method + " " + r.URL.Path {
		case "GET /bridge/devices/device-1/pending-plans":
			_ = json.NewEncoder(w).Encode(map[string]any{"plans": []ExecutionPlan{plan}})
		case "POST /execution/plans/plan-1/ack":
			updated := plan
			updated.Status = "acknowledged"
			_ = json.NewEncoder(w).Encode(map[string]any{"plan": updated})
		case "POST /execution/plans/plan-1/start":
			updated := plan
			updated.Status = "running"
			_ = json.NewEncoder(w).Encode(map[string]any{"plan": updated})
		case "POST /execution/plans/plan-1/events":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body["event_type"] != "bridge.fake_execution" {
				t.Fatalf("unexpected event body: %#v", body)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"event": ExecutionEvent{
					EventType: "bridge.fake_execution",
					PlanID:    "plan-1",
					Sequence:  1,
				},
			})
		case "POST /execution/plans/plan-1/complete":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body["summary"] != fakeExecutionSummary {
				t.Fatalf("unexpected completion body: %#v", body)
			}
			updated := plan
			updated.Status = "completed"
			_ = json.NewEncoder(w).Encode(map[string]any{
				"plan": updated,
				"receipt": ExecutionReceipt{
					ID:      "receipt-1",
					PlanID:  "plan-1",
					Status:  "completed",
					Summary: fakeExecutionSummary,
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	cfg := Config{
		APIURL:   server.URL,
		DeviceID: "device-1",
		UserID:   "user-1",
		Bindings: []ProjectBinding{
			{ID: "binding-1", DeviceID: "device-1", Trusted: true},
		},
	}
	results, err := RunPendingOnce(
		context.Background(),
		cfg,
		Client{APIURL: server.URL, Token: "bridge-token"},
		PlanValidator{Config: cfg, Now: testValidator(pub).Now, PublicKey: pub},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Status != "completed" {
		t.Fatalf("unexpected results: %#v", results)
	}
	want := []string{
		"GET /bridge/devices/device-1/pending-plans",
		"POST /execution/plans/plan-1/ack",
		"POST /execution/plans/plan-1/start",
		"POST /execution/plans/plan-1/events",
		"POST /execution/plans/plan-1/complete",
	}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("calls:\n got %#v\nwant %#v", calls, want)
	}
}

func TestRunPendingOnceRejectsInvalidPlanWithoutExecuting(t *testing.T) {
	_, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	plan := signedPlan(priv, func(plan *ExecutionPlan) {
		plan.DeviceID = strPtr("other-device")
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("unexpected execution call: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"plans": []ExecutionPlan{plan}})
	}))
	defer server.Close()
	cfg := Config{APIURL: server.URL, DeviceID: "device-1", UserID: "user-1"}
	results, err := RunPendingOnce(
		context.Background(),
		cfg,
		Client{APIURL: server.URL, Token: "bridge-token"},
		PlanValidator{Config: cfg, Now: testValidator(nil).Now},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Status != "rejected" {
		t.Fatalf("unexpected results: %#v", results)
	}
}
