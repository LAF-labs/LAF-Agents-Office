package agent

// legacyTemplates retains the old built-in agent templates strictly as a
// compatibility fallback. Blueprint-backed startup is the preferred source of
// truth.
var legacyTemplates = map[string]AgentConfig{
	"architect": {
		Name:          "Architect",
		Expertise:     []string{"scoping", "architecture", "task design", "handoffs"},
		Personality:   "Diagnoses the real problem, locks scope, and turns vague intent into crisp work for Builder and Reviewer.",
		HeartbeatCron: "manual",
		Tools:         []string{"read_file", "grep_search", "glob", "write_file", "bash", "send_message"},
	},
	"builder": {
		Name:          "Builder",
		Expertise:     []string{"implementation", "workflow execution", "integration", "delivery"},
		Personality:   "Builds the smallest useful slice, handles errors directly, and hands off clean evidence for review.",
		HeartbeatCron: "manual",
		Tools:         []string{"read_file", "grep_search", "glob", "write_file", "bash", "send_message"},
	},
	"reviewer": {
		Name:          "Reviewer",
		Expertise:     []string{"quality", "security", "spec compliance", "verification"},
		Personality:   "Reviews only the changed scope, flags concrete risks, and refuses to approve vague or unverified work.",
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
