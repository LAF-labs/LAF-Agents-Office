package bridge

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

type ExecutionPlan struct {
	ID                   string          `json:"id"`
	TeamID               string          `json:"team_id"`
	ProjectID            *string         `json:"project_id"`
	TaskID               *string         `json:"task_id"`
	BindingID            *string         `json:"binding_id"`
	ActorUserID          string          `json:"actor_user_id"`
	ExecutorUserID       *string         `json:"executor_user_id"`
	DeviceID             *string         `json:"device_id"`
	Mode                 string          `json:"mode"`
	Provider             string          `json:"provider"`
	RequiredPermissions  json.RawMessage `json:"required_permissions"`
	EffectivePermissions json.RawMessage `json:"effective_permissions"`
	ContextRefs          json.RawMessage `json:"context_refs"`
	Prompt               string          `json:"prompt"`
	Policy               json.RawMessage `json:"policy"`
	ExpiresAt            string          `json:"expires_at"`
	SignatureAlg         string          `json:"signature_alg"`
	SignatureKeyID       string          `json:"signature_key_id"`
	PayloadHash          string          `json:"payload_hash"`
	Signature            string          `json:"signature"`
	Nonce                string          `json:"nonce"`
	Status               string          `json:"status"`
}

type PlanValidator struct {
	Config    Config
	PublicKey ed25519.PublicKey
	Now       func() time.Time
}

func PlanValidatorFromConfig(cfg Config) (PlanValidator, error) {
	raw := strings.TrimSpace(os.Getenv(product.Env("BRIDGE_PLAN_PUBLIC_KEY")))
	if raw == "" {
		raw = strings.TrimSpace(cfg.PlanSigningPublicKey)
	}
	validator := PlanValidator{Config: cfg}
	if raw == "" {
		return validator, nil
	}
	publicKey, err := ParseEd25519PublicKey(raw)
	if err != nil {
		return PlanValidator{}, err
	}
	validator.PublicKey = publicKey
	return validator, nil
}

func (v PlanValidator) Validate(plan ExecutionPlan) error {
	now := time.Now
	if v.Now != nil {
		now = v.Now
	}
	expiresAt, err := time.Parse(time.RFC3339, plan.ExpiresAt)
	if err != nil {
		return fmt.Errorf("invalid plan expiry: %w", err)
	}
	if !expiresAt.After(now()) {
		return errors.New("execution plan expired")
	}
	if plan.DeviceID == nil || *plan.DeviceID != v.Config.DeviceID {
		return errors.New("execution plan targets a different device")
	}
	if plan.ExecutorUserID != nil && v.Config.UserID != "" && *plan.ExecutorUserID != v.Config.UserID {
		return errors.New("execution plan targets a different executor")
	}
	if plan.BindingID != nil && strings.TrimSpace(*plan.BindingID) != "" {
		if !v.hasTrustedBinding(*plan.BindingID) {
			return errors.New("execution plan references an unknown local binding")
		}
	}
	if plan.Mode == "my_bridge" && (plan.BindingID == nil || strings.TrimSpace(*plan.BindingID) == "") {
		return errors.New("execution plan references an unknown local binding")
	}
	if len(v.PublicKey) > 0 {
		if err := VerifyPlanSignature(plan, v.PublicKey); err != nil {
			return err
		}
	}
	return nil
}

func (v PlanValidator) hasTrustedBinding(id string) bool {
	for _, binding := range v.Config.Bindings {
		if binding.ID == id && binding.Trusted {
			if binding.DeviceID == "" || binding.DeviceID == v.Config.DeviceID {
				return true
			}
		}
	}
	return false
}

func VerifyPlanSignature(plan ExecutionPlan, publicKey ed25519.PublicKey) error {
	if strings.ToLower(strings.TrimSpace(plan.SignatureAlg)) != "ed25519" {
		return errors.New("unsupported execution plan signature algorithm")
	}
	payload := CanonicalPlanPayload(plan)
	if strings.TrimSpace(plan.PayloadHash) != "" {
		sum := sha256.Sum256(payload)
		if !strings.EqualFold(plan.PayloadHash, hex.EncodeToString(sum[:])) {
			return errors.New("execution plan payload hash mismatch")
		}
	}
	signature, err := base64.StdEncoding.DecodeString(plan.Signature)
	if err != nil {
		return fmt.Errorf("invalid execution plan signature encoding: %w", err)
	}
	if !ed25519.Verify(publicKey, payload, signature) {
		return errors.New("invalid execution plan signature")
	}
	return nil
}

func CanonicalPlanPayload(plan ExecutionPlan) []byte {
	fields := []struct {
		name  string
		value []byte
	}{
		{"id", jsonScalar(plan.ID)},
		{"team_id", jsonScalar(plan.TeamID)},
		{"project_id", jsonStringPtr(plan.ProjectID)},
		{"task_id", jsonStringPtr(plan.TaskID)},
		{"binding_id", jsonStringPtr(plan.BindingID)},
		{"actor_user_id", jsonScalar(plan.ActorUserID)},
		{"executor_user_id", jsonStringPtr(plan.ExecutorUserID)},
		{"device_id", jsonStringPtr(plan.DeviceID)},
		{"mode", jsonScalar(plan.Mode)},
		{"provider", jsonScalar(plan.Provider)},
		{"required_permissions", jsonRawOrNull(plan.RequiredPermissions)},
		{"effective_permissions", jsonRawOrNull(plan.EffectivePermissions)},
		{"context_refs", jsonRawOrNull(plan.ContextRefs)},
		{"prompt", jsonScalar(plan.Prompt)},
		{"policy", jsonRawOrNull(plan.Policy)},
		{"expires_at", jsonScalar(plan.ExpiresAt)},
		{"nonce", jsonScalar(plan.Nonce)},
	}
	var out bytes.Buffer
	out.WriteByte('{')
	for i, field := range fields {
		if i > 0 {
			out.WriteByte(',')
		}
		out.Write(jsonScalar(field.name))
		out.WriteByte(':')
		out.Write(field.value)
	}
	out.WriteByte('}')
	return out.Bytes()
}

func ParseEd25519PublicKey(raw string) (ed25519.PublicKey, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return nil, errors.New("public key is required")
	}
	if block, _ := pem.Decode([]byte(text)); block != nil {
		key, err := x509.ParsePKIXPublicKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		edKey, ok := key.(ed25519.PublicKey)
		if !ok {
			return nil, errors.New("public key is not Ed25519")
		}
		return edKey, nil
	}
	data, err := base64.StdEncoding.DecodeString(text)
	if err != nil {
		return nil, err
	}
	if len(data) != ed25519.PublicKeySize {
		return nil, errors.New("public key is not an Ed25519 raw key")
	}
	return ed25519.PublicKey(data), nil
}

func jsonScalar(value string) []byte {
	data, _ := json.Marshal(value)
	return data
}

func jsonStringPtr(value *string) []byte {
	if value == nil {
		return []byte("null")
	}
	return jsonScalar(*value)
}

func jsonRawOrNull(value json.RawMessage) []byte {
	if len(bytes.TrimSpace(value)) == 0 {
		return []byte("null")
	}
	return bytes.TrimSpace(value)
}
