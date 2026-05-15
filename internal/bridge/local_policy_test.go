package bridge

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestLocalPolicyEmptyCodexRequiresApproval(t *testing.T) {
	plan := localPolicyPlan(json.RawMessage(`{}`))
	review := ReviewLocalPolicy(plan, Config{UserID: "user-1"}, LocalPolicyOptions{})
	if !review.RequiresApproval {
		t.Fatalf("expected codex default policy to require approval: %#v", review)
	}
	if review.Sandbox != "workspace-write" {
		t.Fatalf("sandbox: got %q want workspace-write", review.Sandbox)
	}
}

func TestLocalPolicyReadOnlySameActorDoesNotRequireApproval(t *testing.T) {
	plan := localPolicyPlan(json.RawMessage(`{"sandbox":"read-only"}`))
	decision, err := (LocalPolicyApprover{Config: Config{UserID: "user-1"}}).Decide(
		t.Context(),
		plan,
		ProjectBinding{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if decision.Status != LocalApprovalNotRequired {
		t.Fatalf("decision: %#v", decision)
	}
}

func TestLocalPolicyWorkspaceWriteDeniedWithoutApprovalChannel(t *testing.T) {
	plan := localPolicyPlan(json.RawMessage(`{"sandbox":"workspace-write"}`))
	decision, err := (LocalPolicyApprover{Config: Config{UserID: "user-1"}}).Decide(
		t.Context(),
		plan,
		ProjectBinding{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if decision.Status != LocalApprovalDenied {
		t.Fatalf("decision: %#v", decision)
	}
	if !strings.Contains(decision.Reason, "workspace-write") {
		t.Fatalf("reason should mention workspace-write: %q", decision.Reason)
	}
}

func TestLocalPolicyAutoApproveRequiredWorkspaceWrite(t *testing.T) {
	plan := localPolicyPlan(json.RawMessage(`{"sandbox":"workspace-write"}`))
	decision, err := (LocalPolicyApprover{
		Config: Config{UserID: "user-1"},
		Options: LocalPolicyOptions{
			AutoApproveRequired: true,
		},
	}).Decide(t.Context(), plan, ProjectBinding{})
	if err != nil {
		t.Fatal(err)
	}
	if decision.Status != LocalApprovalApproved {
		t.Fatalf("decision: %#v", decision)
	}
}

func TestLocalPolicyNetworkDeniedUnlessAllowed(t *testing.T) {
	plan := localPolicyPlan(json.RawMessage(`{"sandbox":"read-only","network":true}`))
	decision, err := (LocalPolicyApprover{Config: Config{UserID: "user-1"}}).Decide(
		t.Context(),
		plan,
		ProjectBinding{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if decision.Status != LocalApprovalDenied || !strings.Contains(decision.Reason, "network") {
		t.Fatalf("decision: %#v", decision)
	}

	decision, err = (LocalPolicyApprover{
		Config: Config{UserID: "user-1"},
		Options: LocalPolicyOptions{
			AllowNetwork:        true,
			AutoApproveRequired: true,
		},
	}).Decide(t.Context(), plan, ProjectBinding{})
	if err != nil {
		t.Fatal(err)
	}
	if decision.Status != LocalApprovalApproved {
		t.Fatalf("decision with network allowed: %#v", decision)
	}
}

func localPolicyPlan(policy json.RawMessage) ExecutionPlan {
	return ExecutionPlan{
		ActorUserID: "user-1",
		Provider:    "codex",
		Policy:      policy,
	}
}
