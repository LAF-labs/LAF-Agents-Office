package bridge

import (
	"context"
	"fmt"
)

const fakeExecutionSummary = "laf-bridge skeleton validated the plan; provider execution is not implemented yet"

type ExecutionEvent struct {
	ID        string         `json:"id"`
	TeamID    string         `json:"team_id"`
	PlanID    string         `json:"plan_id"`
	TaskID    *string        `json:"task_id,omitempty"`
	Sequence  int            `json:"sequence"`
	EventType string         `json:"event_type"`
	Payload   map[string]any `json:"payload"`
	Redacted  bool           `json:"redacted"`
}

type ExecutionReceipt struct {
	ID        string `json:"id"`
	TeamID    string `json:"team_id"`
	PlanID    string `json:"plan_id"`
	Status    string `json:"status"`
	Summary   string `json:"summary"`
	Provider  string `json:"provider"`
	CreatedAt string `json:"created_at,omitempty"`
}

type RunResult struct {
	PlanID string `json:"plan_id"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

func RunPendingOnce(ctx context.Context, cfg Config, client Client, validator PlanValidator) ([]RunResult, error) {
	if client.Token == "" {
		token, err := ResolveToken(cfg)
		if err != nil {
			return nil, err
		}
		client.Token = token
	}
	if client.APIURL == "" {
		client.APIURL = cfg.APIURL
	}
	if validator.Config.DeviceID == "" {
		validator.Config = cfg
	}
	plans, err := client.PendingPlans(ctx, cfg.DeviceID)
	if err != nil {
		return nil, err
	}
	results := make([]RunResult, 0, len(plans))
	for _, plan := range plans {
		result := RunResult{PlanID: plan.ID}
		if err := validator.Validate(plan); err != nil {
			result.Status = "rejected"
			result.Error = err.Error()
			results = append(results, result)
			continue
		}
		if _, err := client.AckPlan(ctx, plan.ID, 300); err != nil {
			return results, fmt.Errorf("ack plan %s: %w", plan.ID, err)
		}
		if _, err := client.StartPlan(ctx, plan.ID, 300); err != nil {
			return results, fmt.Errorf("start plan %s: %w", plan.ID, err)
		}
		if _, err := client.UploadPlanEvent(ctx, plan.ID, 1, "bridge.fake_execution", map[string]any{
			"message": "plan validated by laf-bridge skeleton",
		}); err != nil {
			return results, fmt.Errorf("upload event for plan %s: %w", plan.ID, err)
		}
		if _, _, err := client.CompletePlan(ctx, plan.ID, "completed", fakeExecutionSummary); err != nil {
			return results, fmt.Errorf("complete plan %s: %w", plan.ID, err)
		}
		result.Status = "completed"
		results = append(results, result)
	}
	return results, nil
}
