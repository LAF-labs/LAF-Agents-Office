package team

import (
	"strings"
	"time"
)

type CollaborationMode string

const (
	CollaborationModeFocus         CollaborationMode = "focus"
	CollaborationModeCollaborative CollaborationMode = "collaborative"
	CollaborationModeOneOnOne      CollaborationMode = "1o1"
)

func (l *Launcher) CollaborationMode() CollaborationMode {
	if l != nil && l.isOneOnOne() {
		return CollaborationModeOneOnOne
	}
	if l != nil && l.isFocusModeEnabled() {
		return CollaborationModeFocus
	}
	return CollaborationModeCollaborative
}

func messageComesFromHumanOrSystem(msg channelMessage) bool {
	switch strings.TrimSpace(msg.From) {
	case "you", "human", "automation":
		return true
	default:
		return msg.Kind == messageKindAutomation
	}
}

func messageIsStatusOnly(msg channelMessage) bool {
	return strings.HasPrefix(strings.TrimSpace(msg.Content), "[STATUS]")
}

func specialistUpdateNeedsLeadAttention(msg channelMessage) bool {
	return !messageIsStatusOnly(msg)
}

func (l *Launcher) specialistUpdateNeedsLeadAttention(msg channelMessage) bool {
	if !specialistUpdateNeedsLeadAttention(msg) {
		return false
	}
	if l == nil || l.broker == nil {
		return true
	}
	return !l.broker.isExactDuplicateSpecialistUpdate(msg, 2*time.Minute)
}

func (b *Broker) isExactDuplicateSpecialistUpdate(msg channelMessage, window time.Duration) bool {
	if b == nil || window <= 0 {
		return false
	}
	if len(msg.Tagged) > 0 || strings.TrimSpace(msg.Content) == "" {
		return false
	}
	if messageComesFromHumanOrSystem(msg) {
		return false
	}
	channel := normalizeChannelSlug(msg.Channel)
	content := strings.TrimSpace(msg.Content)
	from := strings.TrimSpace(msg.From)
	msgTime := parseDuplicateCheckTime(msg.Timestamp)
	b.mu.Lock()
	defer b.mu.Unlock()
	for i := len(b.messages) - 1; i >= 0; i-- {
		existing := b.messages[i]
		if strings.TrimSpace(existing.ID) == strings.TrimSpace(msg.ID) {
			continue
		}
		if normalizeChannelSlug(existing.Channel) != channel || strings.TrimSpace(existing.From) != from {
			continue
		}
		if len(existing.Tagged) > 0 || strings.TrimSpace(existing.Content) != content {
			return false
		}
		existingTime := parseDuplicateCheckTime(existing.Timestamp)
		if msgTime.IsZero() || existingTime.IsZero() {
			return true
		}
		return msgTime.Sub(existingTime) >= 0 && msgTime.Sub(existingTime) <= window
	}
	return false
}

func parseDuplicateCheckTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}
	}
	if ts, err := time.Parse(time.RFC3339, raw); err == nil {
		return ts
	}
	if ts, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return ts
	}
	return time.Time{}
}
