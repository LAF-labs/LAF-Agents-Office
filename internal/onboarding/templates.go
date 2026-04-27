package onboarding

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/operations"
)

// TaskTemplate describes a first-task suggestion shown during onboarding.
// Templates are scoped to a specific agent role via OwnerSlug.
type TaskTemplate struct {
	// ID is a stable, URL-safe identifier for the template.
	ID string `json:"id"`

	// Title is the short, human-readable task name.
	Title string `json:"title"`

	// Description is a single-sentence clarification shown below the title.
	Description string `json:"description"`

	// OwnerSlug is the agent slug that should receive this task.
	OwnerSlug string `json:"owner_slug"`
}

const blankSlateStarterTemplateID = "__blank_slate__"

// DefaultTemplates returns the generic fallback starter tasks used when no
// blueprint-specific task list can be resolved.
func DefaultTemplates() []TaskTemplate {
	return []TaskTemplate{
		{ID: "product-plan", Title: "Write the product work plan", Description: "Define the user problem, target workflow, and first shippable slice.", OwnerSlug: "planner"},
		{ID: "repo", Title: "Prepare the project repository", Description: "Confirm the repo, branch, local setup, and test command agents should use.", OwnerSlug: "executor"},
		{ID: "implementation-task", Title: "Open the first implementation task", Description: "Turn the plan into one concrete coding task with acceptance checks.", OwnerSlug: "executor"},
		{ID: "project-wiki", Title: "Seed the project wiki", Description: "Record decisions, repo notes, and current constraints where agents can reuse them.", OwnerSlug: "planner"},
		{ID: "automation-map", Title: "Map the first automation candidate", Description: "Pick one repeated startup workflow that can be safely automated after the core loop works.", OwnerSlug: "ceo"},
	}
}

// RevOpsTemplates preserves the legacy pack route without exposing
// domain-specific starter work in new local workspaces.
func RevOpsTemplates() []TaskTemplate {
	return []TaskTemplate{
		{ID: "work-audit", Title: "Audit the active work queue", Description: "Find stale tasks, missing owners, unclear next steps, and blocked delivery lanes.", OwnerSlug: "analyst"},
		{ID: "next-build-brief", Title: "Prepare the next build brief", Description: "Summarize the goal, constraints, owner, and acceptance checks for the next project task.", OwnerSlug: "ae"},
		{ID: "reopen-paused-work", Title: "Reopen paused work", Description: "Identify useful paused work and propose the smallest next action to restart it.", OwnerSlug: "sdr"},
		{ID: "triage-inbound-work", Title: "Triage inbound work", Description: "Sort new requests by urgency, product value, and whether they need human approval.", OwnerSlug: "analyst"},
		{ID: "unstick-blocked-work", Title: "Unstick blocked work", Description: "Find blocked project tasks, diagnose the blocker, and recommend the next owner action.", OwnerSlug: "ops-lead"},
	}
}

func BlankSlateTemplates() []TaskTemplate {
	return []TaskTemplate{
		{ID: "objective", Title: "Choose the first real business win", Description: "Turn the directive into one concrete outcome for a real customer, audience, or internal operation this week.", OwnerSlug: "founder"},
		{ID: "offer", Title: "Draft the first sellable offer", Description: "Name the customer, the promise, the scope, and the next decision needed to move the business forward.", OwnerSlug: "operator"},
		{ID: "delivery", Title: "Build the first delivery loop", Description: "Create the minimum workflow, handoffs, approvals, and artifacts needed to deliver the offer end to end.", OwnerSlug: "builder"},
		{ID: "instrumentation", Title: "Create the operating record", Description: "Set up the place where client state, approvals, and delivery evidence will live so the office can keep operating.", OwnerSlug: "founder"},
		{ID: "go-live", Title: "Create missing capabilities and take the first live step", Description: "If agents, channels, skills, or tooling are missing, create them, then execute the smallest safe real action in the business workflow.", OwnerSlug: "founder"},
	}
}

// TemplatesForPack is a legacy alias retained for older callers that still
// talk about packs.
func TemplatesForPack(packSlug string) []TaskTemplate {
	return TemplatesForSelection("", packSlug)
}

func TemplatesForSelection(repoRoot, selection string) []TaskTemplate {
	repoRoot = resolveTemplatesRepoRoot(repoRoot)
	selection = strings.TrimSpace(selection)
	switch selection {
	case blankSlateStarterTemplateID, "from-scratch", "blank-slate":
		return BlankSlateTemplates()
	}
	if repoRoot != "" && selection != "" {
		if blueprint, err := operations.LoadBlueprint(repoRoot, selection); err == nil {
			if templates := templatesFromBlueprint(blueprint); len(templates) > 0 {
				return templates
			}
		}
	}
	switch selection {
	case "revops":
		return RevOpsTemplates()
	default:
		return DefaultTemplates()
	}
}

func templatesFromBlueprint(blueprint operations.Blueprint) []TaskTemplate {
	out := make([]TaskTemplate, 0, len(blueprint.Starter.Tasks))
	for _, task := range blueprint.Starter.Tasks {
		title := strings.TrimSpace(task.Title)
		description := strings.TrimSpace(task.Details)
		owner := strings.TrimSpace(task.Owner)
		if title == "" || description == "" || owner == "" {
			continue
		}
		out = append(out, TaskTemplate{
			ID:          onboardingTemplateID(title),
			Title:       title,
			Description: description,
			OwnerSlug:   owner,
		})
		if len(out) == 5 {
			break
		}
	}
	return out
}

func onboardingTemplateID(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, " ", "-")
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == '_' || r == '.':
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		default:
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// ResolveTemplatesRepoRoot walks up from repoRoot (or cwd if empty) until
// it finds a templates/operations directory, returning the containing
// path. Used by the broker to load curated blueprints when the user
// finishes onboarding.
func ResolveTemplatesRepoRoot(repoRoot string) string {
	return resolveTemplatesRepoRoot(repoRoot)
}

func resolveTemplatesRepoRoot(repoRoot string) string {
	repoRoot = strings.TrimSpace(repoRoot)
	if repoRoot == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return ""
		}
		repoRoot = cwd
	}
	for current := repoRoot; ; current = filepath.Dir(current) {
		if _, err := os.Stat(filepath.Join(current, "templates", "operations")); err == nil {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
	}
	return ""
}
