package team

import "strings"

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
