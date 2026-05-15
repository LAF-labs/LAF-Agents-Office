package bridge

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"
)

func TestPlanValidatorAcceptsValidSignedPlan(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	plan := signedPlan(priv, func(plan *ExecutionPlan) {})
	validator := testValidator(pub)
	if err := validator.Validate(plan); err != nil {
		t.Fatal(err)
	}
}

func TestPlanValidatorRejectsInvalidSignature(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	plan := signedPlan(priv, func(plan *ExecutionPlan) {})
	plan.Prompt = "tampered after signing"
	if err := testValidator(pub).Validate(plan); err == nil {
		t.Fatal("expected invalid signature error")
	}
}

func TestPlanValidatorRejectsExpiredPlan(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	plan := signedPlan(priv, func(plan *ExecutionPlan) {
		plan.ExpiresAt = time.Date(2026, 5, 14, 0, 0, 0, 0, time.UTC).Format(time.RFC3339)
	})
	validator := testValidator(pub)
	validator.Now = func() time.Time {
		return time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	}
	if err := validator.Validate(plan); err == nil {
		t.Fatal("expected expired plan error")
	}
}

func TestPlanValidatorRejectsWrongDeviceExecutorAndUnknownBinding(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*ExecutionPlan){
		"wrong device": func(plan *ExecutionPlan) {
			plan.DeviceID = strPtr("other-device")
		},
		"wrong executor": func(plan *ExecutionPlan) {
			plan.ExecutorUserID = strPtr("other-user")
		},
		"unknown binding": func(plan *ExecutionPlan) {
			plan.BindingID = strPtr("missing-binding")
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			plan := signedPlan(priv, mutate)
			if err := testValidator(pub).Validate(plan); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestParseEd25519PublicKeyAcceptsRawBase64(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseEd25519PublicKey(base64.StdEncoding.EncodeToString(pub))
	if err != nil {
		t.Fatal(err)
	}
	if string(parsed) != string(pub) {
		t.Fatal("parsed public key mismatch")
	}
}

func TestPlanValidatorFromConfigParsesSigningPublicKey(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	validator, err := PlanValidatorFromConfig(Config{
		PlanSigningPublicKey: base64.StdEncoding.EncodeToString(pub),
	})
	if err != nil {
		t.Fatal(err)
	}
	if string(validator.PublicKey) != string(pub) {
		t.Fatal("validator public key mismatch")
	}
}

func signedPlan(priv ed25519.PrivateKey, mutate func(*ExecutionPlan)) ExecutionPlan {
	plan := ExecutionPlan{
		ID:                   "plan-1",
		TeamID:               "team-1",
		ProjectID:            strPtr("project-1"),
		TaskID:               strPtr("task-1"),
		BindingID:            strPtr("binding-1"),
		ActorUserID:          "actor-1",
		ExecutorUserID:       strPtr("user-1"),
		DeviceID:             strPtr("device-1"),
		Mode:                 "my_bridge",
		Provider:             "codex",
		RequiredPermissions:  json.RawMessage(`[]`),
		EffectivePermissions: json.RawMessage(`["task:execute_agent"]`),
		ContextRefs:          json.RawMessage(`[]`),
		Prompt:               "Implement the task",
		Policy:               json.RawMessage(`{}`),
		ExpiresAt:            time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC).Format(time.RFC3339),
		SignatureAlg:         "ed25519",
		SignatureKeyID:       "test-key",
		Nonce:                "nonce-1",
		Status:               "pending",
	}
	mutate(&plan)
	payload := CanonicalPlanPayload(plan)
	sum := sha256.Sum256(payload)
	plan.PayloadHash = hex.EncodeToString(sum[:])
	plan.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, payload))
	return plan
}

func testValidator(pub ed25519.PublicKey) PlanValidator {
	return PlanValidator{
		Config: Config{
			DeviceID: "device-1",
			UserID:   "user-1",
			Bindings: []ProjectBinding{
				{ID: "binding-1", DeviceID: "device-1", Trusted: true},
			},
		},
		Now: func() time.Time {
			return time.Date(2026, 5, 14, 0, 0, 0, 0, time.UTC)
		},
		PublicKey: pub,
	}
}

func strPtr(value string) *string {
	return &value
}
