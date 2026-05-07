package agent

import "github.com/LAF-labs/LAF-Agents-Office/internal/office"

// PackSkillSpec defines a skill to pre-seed when a pack is first launched.
type PackSkillSpec struct {
	Name        string
	Title       string
	Description string
	Tags        []string
	Trigger     string
	Content     string
}

// PackDefinition defines a team of agents that work together.
type PackDefinition struct {
	Slug          string
	Name          string
	Description   string
	LeadSlug      string
	Agents        []AgentConfig
	DefaultSkills []PackSkillSpec
}

// legacyPacks retains the old hard-coded pack registry strictly as a
// compatibility fallback for callers that have not yet moved to operation
// blueprints.
var legacyPacks = []PackDefinition{
	{
		Slug:        "starter",
		Name:        "Three-Agent Team",
		Description: "Architect, Builder, and Reviewer for the first project loop",
		LeadSlug:    office.DefaultLeadAgentSlug,
		Agents: []AgentConfig{
			{Slug: office.ArchitectAgentSlug, Name: "Architect", Expertise: []string{"scoping", "architecture", "task design", "handoffs"}, Personality: "Diagnoses the real problem, locks scope, and turns vague intent into crisp work for Builder and Reviewer.", PermissionMode: "plan"},
			{Slug: office.BuilderAgentSlug, Name: "Builder", Expertise: []string{"implementation", "workflow execution", "integration", "delivery"}, Personality: "Builds the smallest useful slice, handles errors directly, and hands off clean evidence for review.", PermissionMode: "auto", AllowedTools: []string{"Edit", "Write", "Bash(go*,git*,npm*,make*)"}},
			{Slug: office.ReviewerAgentSlug, Name: "Reviewer", Expertise: []string{"quality", "security", "spec compliance", "verification"}, Personality: "Reviews only the changed scope, flags concrete risks, and refuses to approve vague or unverified work.", PermissionMode: "plan"},
		},
	},
	{
		Slug:        "founding-team",
		Name:        "Three-Agent Company",
		Description: "Small autonomous company: Architect scopes, Builder executes, Reviewer verifies",
		LeadSlug:    office.DefaultLeadAgentSlug,
		Agents: []AgentConfig{
			{Slug: office.ArchitectAgentSlug, Name: "Architect", Expertise: []string{"scoping", "architecture", "task design", "handoffs"}, Personality: "Diagnoses the real problem, locks scope, and turns vague intent into crisp work for Builder and Reviewer.", PermissionMode: "plan"},
			{Slug: office.BuilderAgentSlug, Name: "Builder", Expertise: []string{"implementation", "workflow execution", "integration", "delivery"}, Personality: "Builds the smallest useful slice, handles errors directly, and hands off clean evidence for review.", PermissionMode: "auto", AllowedTools: []string{"Edit", "Write", "Bash(go*,git*,npm*,make*)"}},
			{Slug: office.ReviewerAgentSlug, Name: "Reviewer", Expertise: []string{"quality", "security", "spec compliance", "verification"}, Personality: "Reviews only the changed scope, flags concrete risks, and refuses to approve vague or unverified work.", PermissionMode: "plan"},
		},
	},
	{
		Slug:        "coding-team",
		Name:        "Delivery Team",
		Description: "High-velocity delivery team with scoped execution and review",
		LeadSlug:    office.DefaultLeadAgentSlug,
		Agents: []AgentConfig{
			{Slug: office.ArchitectAgentSlug, Name: "Architect", Expertise: []string{"architecture", "planning", "task design", "technical decisions"}, Personality: "Senior lead who makes sound scope decisions and coordinates the team.", PermissionMode: "plan"},
			{Slug: office.BuilderAgentSlug, Name: "Builder", Expertise: []string{"frontend", "backend", "APIs", "testing", "delivery"}, Personality: "Practical builder focused on clean, narrow implementations.", PermissionMode: "auto", AllowedTools: []string{"Edit", "Write", "Bash(go*,git*,npm*,make*)"}},
			{Slug: office.ReviewerAgentSlug, Name: "Reviewer", Expertise: []string{"testing", "automation", "quality", "security", "edge-cases"}, Personality: "Quality-focused reviewer who catches issues before they reach production.", PermissionMode: "plan"},
		},
	},
}

// ListLegacyPacks returns a copy of the compatibility pack registry.
func ListLegacyPacks() []PackDefinition {
	out := make([]PackDefinition, 0, len(legacyPacks))
	for _, pack := range legacyPacks {
		cloned := pack
		cloned.Agents = append([]AgentConfig(nil), pack.Agents...)
		cloned.DefaultSkills = append([]PackSkillSpec(nil), pack.DefaultSkills...)
		out = append(out, cloned)
	}
	return out
}

// LookupLegacyPack returns the compatibility pack with the given slug, or nil
// if not found.
func LookupLegacyPack(slug string) *PackDefinition {
	for i := range legacyPacks {
		if legacyPacks[i].Slug == slug {
			pack := legacyPacks[i]
			pack.Agents = append([]AgentConfig(nil), legacyPacks[i].Agents...)
			pack.DefaultSkills = append([]PackSkillSpec(nil), legacyPacks[i].DefaultSkills...)
			return &pack
		}
	}
	return nil
}

// GetPack is a deprecated compatibility alias for LookupLegacyPack.
func GetPack(slug string) *PackDefinition { return LookupLegacyPack(slug) }

// PackSlugs returns the list of all registered pack slugs, in registration order.
func PackSlugs() []string {
	slugs := make([]string, 0, len(legacyPacks))
	for i := range legacyPacks {
		slugs = append(slugs, legacyPacks[i].Slug)
	}
	return slugs
}
