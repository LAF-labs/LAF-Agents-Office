package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	LocalApprovalApproved    = "approved"
	LocalApprovalDenied      = "denied"
	LocalApprovalNotRequired = "not_required"
)

type ApprovalDecision struct {
	Status string
	Reason string
}

type PlanApprover interface {
	Decide(ctx context.Context, plan ExecutionPlan, binding ProjectBinding) (ApprovalDecision, error)
}

type PlanApproverFunc func(ctx context.Context, plan ExecutionPlan, binding ProjectBinding) (ApprovalDecision, error)

func (f PlanApproverFunc) Decide(ctx context.Context, plan ExecutionPlan, binding ProjectBinding) (ApprovalDecision, error) {
	return f(ctx, plan, binding)
}

type LocalPolicyOptions struct {
	AutoApproveRequired    bool
	AllowDangerFullAccess  bool
	AllowDeploy            bool
	AllowDestructiveShell  bool
	AllowGitPush           bool
	AllowNetwork           bool
	DefaultSandboxForCodex string
}

type LocalPolicyApprover struct {
	Config  Config
	Options LocalPolicyOptions
}

func (a LocalPolicyApprover) Decide(_ context.Context, plan ExecutionPlan, _ ProjectBinding) (ApprovalDecision, error) {
	review := ReviewLocalPolicy(plan, a.Config, a.Options)
	if len(review.DenyReasons) > 0 {
		return ApprovalDecision{
			Status: LocalApprovalDenied,
			Reason: "local policy denied execution: " +
				strings.Join(review.DenyReasons, "; "),
		}, nil
	}
	if !review.RequiresApproval {
		return ApprovalDecision{Status: LocalApprovalNotRequired}, nil
	}
	if a.Options.AutoApproveRequired {
		return ApprovalDecision{
			Status: LocalApprovalApproved,
			Reason: strings.Join(review.ApprovalReasons, "; "),
		}, nil
	}
	return ApprovalDecision{
		Status: LocalApprovalDenied,
		Reason: "local approval required but no approval channel is configured: " +
			strings.Join(review.ApprovalReasons, "; "),
	}, nil
}

type LocalPolicyReview struct {
	Sandbox          string
	RequiresApproval bool
	ApprovalReasons  []string
	DenyReasons      []string
}

func ReviewLocalPolicy(plan ExecutionPlan, cfg Config, opts LocalPolicyOptions) LocalPolicyReview {
	policy := parsePlanPolicy(plan.Policy)
	sandbox := EffectiveSandboxForPlan(plan, opts.DefaultSandboxForCodex)

	review := LocalPolicyReview{Sandbox: sandbox}
	require := func(reason string) {
		review.RequiresApproval = true
		review.ApprovalReasons = append(review.ApprovalReasons, reason)
	}
	deny := func(reason string) {
		review.DenyReasons = append(review.DenyReasons, reason)
	}

	switch sandbox {
	case "read-only", "readonly", "read":
		if cfg.UserID != "" && strings.TrimSpace(plan.ActorUserID) != "" && plan.ActorUserID != cfg.UserID {
			require("read-only plan was initiated by another user")
		}
	case "workspace-write", "workspace", "write":
		require("workspace-write sandbox can modify local files")
	case "danger-full-access", "full-access", "danger":
		if !opts.AllowDangerFullAccess {
			deny("danger-full-access sandbox is disabled")
		}
		require("danger-full-access sandbox can modify unrestricted local state")
	default:
		require(fmt.Sprintf("unrecognized sandbox %q needs local approval", sandbox))
	}

	if policy.boolValue("requires_approval", "approval_required", "local_approval_required") {
		require("plan policy explicitly requires local approval")
	}
	if policy.boolValue("network", "network_access", "allow_network") {
		if !opts.AllowNetwork {
			deny("network access is disabled")
		}
		require("network access requested")
	}
	if policy.boolValue("deploy", "deployment", "allow_deploy") {
		if !opts.AllowDeploy {
			deny("deploy actions are disabled")
		}
		require("deploy action requested")
	}
	if policy.boolValue("git_push", "git-push", "push") {
		if !opts.AllowGitPush {
			deny("git push is disabled")
		}
		require("git push requested")
	}
	if policy.boolValue("destructive_shell", "destructive-shell", "destructive") {
		if !opts.AllowDestructiveShell {
			deny("destructive shell is disabled")
		}
		require("destructive shell requested")
	}
	for _, capability := range policy.listValue("capabilities", "capability_flags", "tools") {
		switch normalizePolicyToken(capability) {
		case "network", "network-access":
			if !opts.AllowNetwork {
				deny("network access is disabled")
			}
			require("network access requested")
		case "deploy", "deployment":
			if !opts.AllowDeploy {
				deny("deploy actions are disabled")
			}
			require("deploy action requested")
		case "git-push", "push":
			if !opts.AllowGitPush {
				deny("git push is disabled")
			}
			require("git push requested")
		case "destructive-shell", "destructive":
			if !opts.AllowDestructiveShell {
				deny("destructive shell is disabled")
			}
			require("destructive shell requested")
		}
	}
	return review
}

func EffectiveSandboxForPlan(plan ExecutionPlan, defaultSandboxForCodex string) string {
	policy := parsePlanPolicy(plan.Policy)
	sandbox := normalizePolicyToken(policy.stringValue("sandbox"))
	if sandbox == "" && strings.EqualFold(strings.TrimSpace(plan.Provider), "codex") {
		sandbox = normalizePolicyToken(defaultSandboxForCodex)
		if sandbox == "" {
			sandbox = "workspace-write"
		}
	}
	if sandbox == "" {
		sandbox = "read-only"
	}
	return sandbox
}

func CodexSandboxForPlan(plan ExecutionPlan, defaultSandboxForCodex string) (string, error) {
	switch EffectiveSandboxForPlan(plan, defaultSandboxForCodex) {
	case "read-only", "readonly", "read":
		return "read-only", nil
	case "workspace-write", "workspace", "write":
		return "workspace-write", nil
	case "danger-full-access", "full-access", "danger":
		return "danger-full-access", nil
	default:
		return "", fmt.Errorf("codex cannot enforce sandbox %q", EffectiveSandboxForPlan(plan, defaultSandboxForCodex))
	}
}

type planPolicy map[string]any

func parsePlanPolicy(raw json.RawMessage) planPolicy {
	var out map[string]any
	if len(strings.TrimSpace(string(raw))) == 0 {
		return planPolicy{}
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return planPolicy{"requires_approval": true}
	}
	return planPolicy(out)
}

func (p planPolicy) value(keys ...string) any {
	for _, key := range keys {
		for existing, value := range p {
			if normalizePolicyToken(existing) == normalizePolicyToken(key) {
				return value
			}
		}
	}
	return nil
}

func (p planPolicy) stringValue(keys ...string) string {
	switch value := p.value(keys...).(type) {
	case string:
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func (p planPolicy) boolValue(keys ...string) bool {
	switch value := p.value(keys...).(type) {
	case bool:
		return value
	case string:
		switch normalizePolicyToken(value) {
		case "1", "true", "yes", "enabled", "required", "on":
			return true
		}
	case float64:
		return value != 0
	}
	return false
}

func (p planPolicy) listValue(keys ...string) []string {
	switch value := p.value(keys...).(type) {
	case []any:
		out := make([]string, 0, len(value))
		for _, item := range value {
			if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
				out = append(out, text)
			}
		}
		return out
	case []string:
		return value
	case string:
		if strings.TrimSpace(value) == "" {
			return nil
		}
		parts := strings.Split(value, ",")
		out := make([]string, 0, len(parts))
		for _, part := range parts {
			if text := strings.TrimSpace(part); text != "" {
				out = append(out, text)
			}
		}
		return out
	default:
		return nil
	}
}

func normalizePolicyToken(value string) string {
	return strings.NewReplacer("_", "-", " ", "-").Replace(strings.ToLower(strings.TrimSpace(value)))
}
