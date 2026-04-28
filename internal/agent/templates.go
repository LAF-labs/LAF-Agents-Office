package agent

// legacyTemplates retains the old built-in agent templates strictly as a
// compatibility fallback. Blueprint-backed startup is the preferred source of
// truth.
var legacyTemplates = map[string]AgentConfig{
	"team-lead": {
		Name:          "Team Lead",
		Expertise:     []string{"general", "research", "analysis", "communication", "planning", "orchestration"},
		Personality:   "You are the Team Lead — the primary interface...",
		HeartbeatCron: "manual",
		Tools:         []string{"read_file", "grep_search", "glob", "write_file", "bash", "send_message"},
	},
	"founding-agent": {
		Name:          "Team Lead",
		Expertise:     []string{"general", "research", "analysis", "communication", "planning", "orchestration"},
		Personality:   "Versatile and proactive...",
		HeartbeatCron: "daily",
		Tools:         []string{"read_file", "grep_search", "glob", "write_file", "bash", "send_message"},
	},
	"product-manager": {
		Name:          "Product Manager",
		Expertise:     []string{"requirements", "prioritization", "task-breakdown", "acceptance-checks"},
		Personality:   "Turns fuzzy product goals into clear project tasks and reviewable decisions.",
		HeartbeatCron: "manual",
		Tools:         []string{"read_file", "grep_search", "glob", "write_file", "bash", "send_message"},
	},
	"founding-engineer": {
		Name:          "Founding Engineer",
		Expertise:     []string{"full-stack", "architecture", "testing", "delivery"},
		Personality:   "Ships the smallest solid implementation and keeps project context current.",
		HeartbeatCron: "manual",
		Tools:         []string{"read_file", "grep_search", "glob", "write_file", "bash", "send_message"},
	},
	"ai-engineer": {
		Name:          "AI Engineer",
		Expertise:     []string{"LLMs", "agents", "tool-use", "retrieval", "evaluations"},
		Personality:   "Builds reliable agent workflows and memory-aware automation around the project.",
		HeartbeatCron: "manual",
		Tools:         []string{"read_file", "grep_search", "glob", "write_file", "bash", "send_message"},
	},
	"designer": {
		Name:          "Designer",
		Expertise:     []string{"UI-UX-design", "flows", "prototyping", "visual-systems"},
		Personality:   "Keeps the interface clear, focused, and aligned with the project workflow.",
		HeartbeatCron: "manual",
		Tools:         []string{"read_file", "grep_search", "glob", "write_file", "bash", "send_message"},
	},
}

// LegacyTemplateNames returns the compatibility template names, sorted by the
// caller if ordering matters.
func LegacyTemplateNames() []string {
	names := make([]string, 0, len(legacyTemplates))
	for name := range legacyTemplates {
		names = append(names, name)
	}
	return names
}

// LookupLegacyTemplate returns a compatibility template by name.
func LookupLegacyTemplate(name string) (AgentConfig, bool) {
	cfg, ok := legacyTemplates[name]
	return cfg, ok
}
