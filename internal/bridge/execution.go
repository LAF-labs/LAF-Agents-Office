package bridge

import (
	"context"
	"fmt"
	"strings"
	"sync"
)

const fakeExecutionSummary = "laf-bridge skeleton validated the plan; provider execution is not implemented yet"

type ProviderEvent struct {
	Type    string         `json:"type"`
	Payload map[string]any `json:"payload"`
}

type ExecutionOutcome struct {
	Status       string          `json:"status"`
	Summary      string          `json:"summary"`
	Events       []ProviderEvent `json:"events,omitempty"`
	ChangedFiles []ChangedFile   `json:"changed_files,omitempty"`
	Usage        map[string]int  `json:"usage,omitempty"`
}

type PlanExecutor interface {
	Execute(ctx context.Context, plan ExecutionPlan, binding ProjectBinding) (ExecutionOutcome, error)
}

type FakeExecutor struct{}

func (FakeExecutor) Execute(context.Context, ExecutionPlan, ProjectBinding) (ExecutionOutcome, error) {
	return ExecutionOutcome{
		Status:  "completed",
		Summary: fakeExecutionSummary,
		Events: []ProviderEvent{
			{
				Type: "bridge.fake_execution",
				Payload: map[string]any{
					"message": "plan validated by laf-bridge skeleton",
				},
			},
		},
	}, nil
}

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

type RunPendingOptions struct {
	Executor PlanExecutor
	Guard    *PlanRunGuard
}

type PlanRunGuard struct {
	mu       sync.Mutex
	active   map[string]struct{}
	terminal map[string]struct{}
}

func NewPlanRunGuard() *PlanRunGuard {
	return &PlanRunGuard{
		active:   map[string]struct{}{},
		terminal: map[string]struct{}{},
	}
}

func (g *PlanRunGuard) TryStart(planID string) bool {
	if g == nil || strings.TrimSpace(planID) == "" {
		return true
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if _, ok := g.terminal[planID]; ok {
		return false
	}
	if _, ok := g.active[planID]; ok {
		return false
	}
	g.active[planID] = struct{}{}
	return true
}

func (g *PlanRunGuard) Finish(planID string, terminal bool) {
	if g == nil || strings.TrimSpace(planID) == "" {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.active, planID)
	if terminal {
		g.terminal[planID] = struct{}{}
	}
}

func RunPendingOnce(ctx context.Context, cfg Config, client Client, validator PlanValidator) ([]RunResult, error) {
	return RunPendingOnceWithExecutor(ctx, cfg, client, validator, FakeExecutor{})
}

func RunPendingOnceWithExecutor(
	ctx context.Context,
	cfg Config,
	client Client,
	validator PlanValidator,
	executor PlanExecutor,
) ([]RunResult, error) {
	return RunPendingOnceWithOptions(ctx, cfg, client, validator, RunPendingOptions{
		Executor: executor,
	})
}

func RunPendingOnceWithOptions(
	ctx context.Context,
	cfg Config,
	client Client,
	validator PlanValidator,
	options RunPendingOptions,
) ([]RunResult, error) {
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
	executor := options.Executor
	if executor == nil {
		executor = FakeExecutor{}
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
		if !options.Guard.TryStart(plan.ID) {
			result.Status = "skipped"
			results = append(results, result)
			continue
		}
		if _, err := client.AckPlan(ctx, plan.ID, 300); err != nil {
			options.Guard.Finish(plan.ID, false)
			return results, fmt.Errorf("ack plan %s: %w", plan.ID, err)
		}
		if _, err := client.StartPlan(ctx, plan.ID, 300); err != nil {
			options.Guard.Finish(plan.ID, false)
			return results, fmt.Errorf("start plan %s: %w", plan.ID, err)
		}
		binding := cfg.BindingForPlan(plan)
		outcome, execErr := executor.Execute(ctx, plan, binding)
		if execErr != nil {
			outcome = ExecutionOutcome{
				Status:  "failed",
				Summary: RedactText(execErr.Error()),
				Events: []ProviderEvent{{
					Type: "bridge.execution_error",
					Payload: map[string]any{
						"error": RedactText(execErr.Error()),
					},
				}},
			}
		}
		if strings.TrimSpace(outcome.Status) == "" {
			outcome.Status = "completed"
		}
		for i, event := range outcome.Events {
			if _, err := client.UploadPlanEvent(ctx, plan.ID, i+1, event.Type, event.Payload); err != nil {
				options.Guard.Finish(plan.ID, false)
				return results, fmt.Errorf("upload event for plan %s: %w", plan.ID, err)
			}
		}
		if _, _, err := client.CompletePlanOutcome(ctx, plan.ID, outcome); err != nil {
			options.Guard.Finish(plan.ID, false)
			return results, fmt.Errorf("complete plan %s: %w", plan.ID, err)
		}
		options.Guard.Finish(plan.ID, true)
		result.Status = outcome.Status
		if execErr != nil {
			result.Error = RedactText(execErr.Error())
		}
		results = append(results, result)
	}
	return results, nil
}
