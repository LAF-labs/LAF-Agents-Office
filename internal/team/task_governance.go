package team

import "strings"

func taskPermissionForAction(action string) string {
	switch strings.TrimSpace(action) {
	case "", "create":
		return permissionTaskCreate
	case "update":
		return permissionTaskUpdate
	case "claim", "assign", "reassign", "release":
		return permissionTaskAssign
	default:
		return permissionTaskChangeStatus
	}
}

func populateTaskGovernanceFields(task *teamTask, modelMode string) {
	if task == nil {
		return
	}
	task.ModelMode = normalizeModelMode(firstNonEmptyString(modelMode, task.ModelMode))
	owner := strings.TrimSpace(task.Owner)
	if task.AssigneeID == "" {
		task.AssigneeID = owner
	}
	if task.AssigneeType == "" {
		switch {
		case strings.TrimSpace(task.AssigneeID) == "":
			task.AssigneeType = "none"
		case isHumanActorSlug(task.AssigneeID):
			task.AssigneeType = "human"
		default:
			task.AssigneeType = "agent"
		}
	}
}
