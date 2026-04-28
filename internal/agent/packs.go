package agent

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
		Name:        "Starter Team",
		Description: "CEO, PM, and founding engineer for the first project loop",
		LeadSlug:    "ceo",
		Agents: []AgentConfig{
			{Slug: "ceo", Name: "CEO", Expertise: []string{"strategy", "decision-making", "prioritization", "delegation", "orchestration"}, Personality: "Strategic leader who breaks down directives into clear specialist assignments", PermissionMode: "plan"},
			{Slug: "pm", Name: "Product Manager", Expertise: []string{"roadmap", "user-stories", "requirements", "prioritization", "specs"}, Personality: "Product lead who turns goals into clear project tasks and acceptance checks", PermissionMode: "plan"},
			{Slug: "eng", Name: "Founding Engineer", Expertise: []string{"full-stack", "backend", "frontend", "APIs", "databases", "architecture", "DevOps"}, Personality: "Scrappy full-stack engineer who ships fast and keeps the system simple until it needs to be complex", PermissionMode: "auto", AllowedTools: []string{"Edit", "Write", "Bash(go*,git*,npm*,make*)"}},
		},
	},
	{
		Slug:        "founding-team",
		Name:        "Founding Team",
		Description: "Full autonomous company — CEO delegates to specialists",
		LeadSlug:    "ceo",
		Agents: []AgentConfig{
			{Slug: "ceo", Name: "CEO", Expertise: []string{"strategy", "decision-making", "prioritization", "delegation", "orchestration"}, Personality: "Strategic leader who breaks down complex directives into clear specialist assignments", PermissionMode: "plan"},
			{Slug: "pm", Name: "Product Manager", Expertise: []string{"roadmap", "user-stories", "requirements", "prioritization", "specs"}, Personality: "Detail-oriented PM who translates business needs into actionable specs", PermissionMode: "plan"},
			{Slug: "fe", Name: "Frontend Engineer", Expertise: []string{"frontend", "React", "CSS", "UI-UX", "components"}, Personality: "Frontend specialist focused on clean, accessible implementations", PermissionMode: "auto", AllowedTools: []string{"Edit", "Write", "Bash(npm*)"}},
			{Slug: "be", Name: "Backend Engineer", Expertise: []string{"backend", "APIs", "databases", "infrastructure", "architecture"}, Personality: "Backend engineer focused on reliable, scalable systems", PermissionMode: "auto", AllowedTools: []string{"Edit", "Write", "Bash(go*,git*)"}},
			{Slug: "ai", Name: "AI Engineer", Expertise: []string{"LLMs", "AI-product-design", "retrieval", "evaluations", "agents", "model-integration"}, Personality: "AI engineer focused on making model-powered features reliable, useful, and actually shippable", PermissionMode: "auto", AllowedTools: []string{"Edit", "Write", "Bash(curl*,python*,pip*)"}},
			{Slug: "designer", Name: "Designer", Expertise: []string{"UI-UX-design", "branding", "visual-systems", "prototyping"}, Personality: "Creative designer who balances aesthetics with usability", PermissionMode: "plan"},
		},
	},
	{
		Slug:        "coding-team",
		Name:        "Coding Team",
		Description: "High-velocity software development team",
		LeadSlug:    "ceo",
		Agents: []AgentConfig{
			{Slug: "ceo", Name: "CEO", Expertise: []string{"architecture", "code-review", "technical-decisions", "planning"}, Personality: "Senior technical leader who makes sound architectural decisions and coordinates the team"},
			{Slug: "fe", Name: "Frontend Engineer", Expertise: []string{"frontend", "React", "CSS", "components", "accessibility"}, Personality: "Frontend specialist focused on clean, accessible implementations"},
			{Slug: "be", Name: "Backend Engineer", Expertise: []string{"backend", "APIs", "databases", "DevOps", "infrastructure"}, Personality: "Backend engineer focused on reliable, scalable systems"},
			{Slug: "qa", Name: "QA Engineer", Expertise: []string{"testing", "automation", "quality", "edge-cases", "CI-CD"}, Personality: "Quality-focused engineer who catches issues before they reach production"},
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
