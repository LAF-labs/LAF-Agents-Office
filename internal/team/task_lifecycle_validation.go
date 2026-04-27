package team

import (
	"fmt"
	"strings"
)

func normalizeTaskExecutionModeInput(mode string) (string, error) {
	mode = strings.ToLower(strings.TrimSpace(mode))
	switch mode {
	case "":
		return "", nil
	case executionModeOffice, executionModeLocalWorktree, executionModeLiveExternal:
		return mode, nil
	default:
		return "", fmt.Errorf("invalid execution_mode %q", mode)
	}
}

func normalizeTaskReviewStateInput(state string) (string, error) {
	state = strings.ToLower(strings.TrimSpace(state))
	switch state {
	case "":
		return "", nil
	case reviewStateNotRequired, reviewStatePendingReview, reviewStateReadyForReview, reviewStateApproved:
		return state, nil
	default:
		return "", fmt.Errorf("invalid review_state %q", state)
	}
}
