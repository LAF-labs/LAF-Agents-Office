package bridge

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestRelayLoopPullsOnConnectAndReconnect(t *testing.T) {
	source := &scriptedRelaySource{
		channels: []chan RelayHint{
			make(chan RelayHint),
			make(chan RelayHint),
		},
	}
	close(source.channels[0])
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var mu sync.Mutex
	pulls := 0
	runner := PendingRunnerFunc(func(context.Context) ([]RunResult, error) {
		mu.Lock()
		defer mu.Unlock()
		pulls++
		if pulls == 2 {
			cancel()
		}
		return nil, nil
	})
	err := RelayLoop{
		DeviceID:     "device-1",
		ReconnectMin: time.Millisecond,
		Runner:       runner,
		Source:       source,
	}.Run(ctx)
	if err != context.Canceled {
		t.Fatalf("relay loop error: %v", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if pulls != 2 {
		t.Fatalf("pulls: got %d want 2", pulls)
	}
}

func TestRelayLoopPullsOnHints(t *testing.T) {
	ch := make(chan RelayHint, 2)
	source := &scriptedRelaySource{channels: []chan RelayHint{ch}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pulls := 0
	runner := PendingRunnerFunc(func(context.Context) ([]RunResult, error) {
		pulls++
		if pulls == 1 {
			ch <- RelayHint{Event: "execution.plan.created", PlanID: "plan-1"}
			ch <- RelayHint{Event: "execution.plan.created", PlanID: "plan-1"}
		}
		if pulls == 3 {
			cancel()
		}
		return nil, nil
	})
	err := RelayLoop{
		DeviceID:     "device-1",
		ReconnectMin: time.Millisecond,
		Runner:       runner,
		Source:       source,
	}.Run(ctx)
	if err != context.Canceled {
		t.Fatalf("relay loop error: %v", err)
	}
	if pulls != 3 {
		t.Fatalf("pulls: got %d want 3", pulls)
	}
}

func TestRelayLoopWithoutSourceRunsOnce(t *testing.T) {
	pulls := 0
	runner := PendingRunnerFunc(func(context.Context) ([]RunResult, error) {
		pulls++
		return nil, nil
	})
	if err := (RelayLoop{Runner: runner}).Run(context.Background()); err != nil {
		t.Fatalf("relay loop error: %v", err)
	}
	if pulls != 1 {
		t.Fatalf("pulls: got %d want 1", pulls)
	}
}

func TestPollLoopRunsImmediatelyThenOnInterval(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pulls := 0
	runner := PendingRunnerFunc(func(context.Context) ([]RunResult, error) {
		pulls++
		if pulls == 2 {
			cancel()
		}
		return nil, nil
	})
	err := (PollLoop{Interval: time.Millisecond, Runner: runner}).Run(ctx)
	if err != context.Canceled {
		t.Fatalf("poll loop error: %v", err)
	}
	if pulls != 2 {
		t.Fatalf("pulls: got %d want 2", pulls)
	}
}

type scriptedRelaySource struct {
	mu       sync.Mutex
	channels []chan RelayHint
	next     int
}

func (s *scriptedRelaySource) Subscribe(context.Context, string) (<-chan RelayHint, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.next >= len(s.channels) {
		ch := make(chan RelayHint)
		close(ch)
		return ch, nil
	}
	ch := s.channels[s.next]
	s.next++
	return ch, nil
}
