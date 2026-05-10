package office

import "strings"

type TaskStatus string
type ExecutionMode string
type ReviewState string
type MessageKind string

const (
	CEOAgentSlug         = "ceo"
	FrontendAgentSlug    = "fe"
	BackendAgentSlug     = "be"
	ArchitectAgentSlug   = "architect"
	BuilderAgentSlug     = "builder"
	ReviewerAgentSlug    = "reviewer"
	AgentMakerAgentSlug  = "agent-maker"
	DefaultLeadAgentSlug = CEOAgentSlug

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

func CoreAgentSlugs() []string {
	return []string{CEOAgentSlug, FrontendAgentSlug, BackendAgentSlug, ReviewerAgentSlug}
}

func IsCoreAgentSlug(slug string) bool {
	slug = normalizeAgentSlug(slug)
	for _, core := range CoreAgentSlugs() {
		if slug == core {
			return true
		}
	}
	return false
}

func IsAgentMakerSlug(slug string) bool {
	return normalizeAgentSlug(slug) == AgentMakerAgentSlug
}

func MapLegacyAgentSlug(slug string) string {
	switch normalizeAgentSlug(slug) {
	case CEOAgentSlug:
		return CEOAgentSlug
	case FrontendAgentSlug:
		return FrontendAgentSlug
	case BackendAgentSlug:
		return BackendAgentSlug
	case ReviewerAgentSlug:
		return ReviewerAgentSlug
	case "architect", "founder", "operator", "planner", "pm", "product", "product-manager", "tech-lead":
		return CEOAgentSlug
	case "designer", "frontend", "front-end", "ui", "ux":
		return FrontendAgentSlug
	case "builder", "executor", "founding-engineer", "ai-engineer", "eng", "backend", "back-end", "ai":
		return BackendAgentSlug
	case "analyst", "qa":
		return ReviewerAgentSlug
	case AgentMakerAgentSlug:
		return AgentMakerAgentSlug
	default:
		return ""
	}
}

func normalizeAgentSlug(slug string) string {
	slug = strings.ToLower(strings.TrimSpace(slug))
	slug = strings.TrimLeft(slug, "@")
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = strings.ReplaceAll(slug, "_", "-")
	return slug
}

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
