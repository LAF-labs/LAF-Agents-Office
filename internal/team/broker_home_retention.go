package team

import (
	"context"
	"log"
	"time"
)

const (
	homeSessionRetentionCronHour   = 4
	homeSessionRetentionCronMinute = 0
)

func (b *Broker) startHomeSessionRetentionCron(ctx context.Context) {
	go func() {
		for {
			next := nextOccurrence(time.Now(), homeSessionRetentionCronHour, homeSessionRetentionCronMinute)
			timer := time.NewTimer(time.Until(next))
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}

			select {
			case <-ctx.Done():
				return
			default:
			}

			b.runHomeSessionRetentionSweep(time.Now())
		}
	}()
}

func (b *Broker) runHomeSessionRetentionSweep(now time.Time) bool {
	b.mu.Lock()
	changed := b.pruneExpiredHomeSessionsLocked(now)
	if changed {
		if err := b.saveLocked(); err != nil {
			log.Printf("home session retention: failed to persist sweep: %v", err)
		}
	}
	b.mu.Unlock()
	return changed
}
