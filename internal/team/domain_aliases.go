package team

import "github.com/LAF-labs/LAF-Agents-Office/internal/office"

type messageReaction = office.MessageReaction
type messageUsage = office.MessageUsage
type channelMessage = office.ChannelMessage
type teamTask = office.TeamTask
type teamProject = office.TeamProject
type officeActionLog = office.ActionLog
type agentActivitySnapshot = office.AgentActivitySnapshot
type officeSignalRecord = office.SignalRecord
type officeDecisionRecord = office.DecisionRecord

const (
	taskStatusTodo       = string(office.TaskStatusTodo)
	taskStatusInProgress = string(office.TaskStatusInProgress)
	taskStatusReview     = string(office.TaskStatusReview)
	taskStatusBlocked    = string(office.TaskStatusBlocked)
	taskStatusDone       = string(office.TaskStatusDone)
	taskStatusCompleted  = string(office.TaskStatusCompleted)
	taskStatusCanceled   = string(office.TaskStatusCanceled)
	taskStatusCancelled  = string(office.TaskStatusCancelled)

	executionModeOffice        = string(office.ExecutionModeOffice)
	executionModeLocalWorktree = string(office.ExecutionModeLocalWorktree)
	executionModeLiveExternal  = string(office.ExecutionModeLiveExternal)

	reviewStateNotRequired    = string(office.ReviewStateNotRequired)
	reviewStatePendingReview  = string(office.ReviewStatePendingReview)
	reviewStateReadyForReview = string(office.ReviewStateReadyForReview)
	reviewStateApproved       = string(office.ReviewStateApproved)

	messageKindAutomation       = string(office.MessageKindAutomation)
	messageKindOnboardingOrigin = string(office.MessageKindOnboardingOrigin)
)

func isLocalWorktreeExecutionMode(mode string) bool {
	return office.IsLocalWorktreeExecutionMode(mode)
}

func isOfficeExecutionMode(mode string) bool {
	return office.IsOfficeExecutionMode(mode)
}

func isLiveExternalExecutionMode(mode string) bool {
	return office.IsLiveExternalExecutionMode(mode)
}
