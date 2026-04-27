package office

import "strings"

type TaskStatus string
type ExecutionMode string
type ReviewState string
type MessageKind string

const (
	TaskStatusTodo       TaskStatus = "todo"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusReview     TaskStatus = "review"
	TaskStatusBlocked    TaskStatus = "blocked"
	TaskStatusDone       TaskStatus = "done"
	TaskStatusCompleted  TaskStatus = "completed"
	TaskStatusCanceled   TaskStatus = "canceled"
	TaskStatusCancelled  TaskStatus = "cancelled"

	ExecutionModeOffice        ExecutionMode = "office"
	ExecutionModeLocalWorktree ExecutionMode = "local_worktree"
	ExecutionModeLiveExternal  ExecutionMode = "live_external"

	ReviewStateNotRequired    ReviewState = "not_required"
	ReviewStatePendingReview  ReviewState = "pending_review"
	ReviewStateReadyForReview ReviewState = "ready_for_review"
	ReviewStateApproved       ReviewState = "approved"

	MessageKindAutomation       MessageKind = "automation"
	MessageKindOnboardingOrigin MessageKind = "onboarding_origin"
)

func IsTerminalTaskStatus(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case string(TaskStatusDone), string(TaskStatusCompleted), string(TaskStatusCanceled), string(TaskStatusCancelled):
		return true
	default:
		return false
	}
}

func IsLocalWorktreeExecutionMode(mode string) bool {
	return strings.EqualFold(strings.TrimSpace(mode), string(ExecutionModeLocalWorktree))
}

func IsLiveExternalExecutionMode(mode string) bool {
	return strings.EqualFold(strings.TrimSpace(mode), string(ExecutionModeLiveExternal))
}

func IsOfficeExecutionMode(mode string) bool {
	return strings.EqualFold(strings.TrimSpace(mode), string(ExecutionModeOffice))
}
