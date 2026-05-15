package bridge

import (
	"context"
	"time"
)

type RelayHint struct {
	Event   string         `json:"event"`
	PlanID  string         `json:"plan_id,omitempty"`
	Payload map[string]any `json:"payload,omitempty"`
}

type RelaySource interface {
	Subscribe(ctx context.Context, deviceID string) (<-chan RelayHint, error)
}

type PendingRunner interface {
	RunPending(ctx context.Context) ([]RunResult, error)
}

type PendingRunnerFunc func(ctx context.Context) ([]RunResult, error)

func (f PendingRunnerFunc) RunPending(ctx context.Context) ([]RunResult, error) {
	return f(ctx)
}

type RelayLoop struct {
	DeviceID     string
	ReconnectMin time.Duration
	Runner       PendingRunner
	Source       RelaySource
}

type PollLoop struct {
	Interval time.Duration
	Runner   PendingRunner
}

func (l PollLoop) Run(ctx context.Context) error {
	if l.Runner == nil {
		return nil
	}
	if _, err := l.Runner.RunPending(ctx); err != nil {
		return err
	}
	interval := l.Interval
	if interval <= 0 {
		interval = 10 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if _, err := l.Runner.RunPending(ctx); err != nil {
				return err
			}
		}
	}
}

func (l RelayLoop) Run(ctx context.Context) error {
	if l.Runner == nil {
		return nil
	}
	if l.Source == nil {
		_, err := l.Runner.RunPending(ctx)
		return err
	}
	delay := l.ReconnectMin
	if delay <= 0 {
		delay = 10 * time.Millisecond
	}
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		hints, err := l.subscribe(ctx)
		if err == nil {
			if _, err := l.Runner.RunPending(ctx); err != nil {
				return err
			}
			for {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case _, ok := <-hints:
					if !ok {
						goto reconnect
					}
					if _, err := l.Runner.RunPending(ctx); err != nil {
						return err
					}
				}
			}
		}
	reconnect:
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
}

func (l RelayLoop) subscribe(ctx context.Context) (<-chan RelayHint, error) {
	return l.Source.Subscribe(ctx, l.DeviceID)
}
