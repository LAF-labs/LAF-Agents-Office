package team

import "strings"

const runtimeBoundaryCapsuleHeading = "Internal runtime boundary capsule:"

var runtimeBoundaryTriggerTerms = []string{
	"bridge/pairing",
	"codex cli",
	"claude code cli",
	"connected runner",
	"desktop bridge",
	"execution plan",
	"headless reply",
	"headless runtime",
	"headless transport",
	"hosted",
	"laf bridge",
	"laf runner",
	"laf-runner",
	"laf_runner",
	"local cli",
	"local runner",
	"model/availability",
	"my bridge",
	"my-bridge",
	"my_bridge",
	"paired bridge",
	"record only",
	"record-only",
	"record_only",
	"runner job",
	"runner status",
	"runner/status",
	"team bridge",
	"team runner",
	"team-bridge",
	"team_bridge",
	"web hosting",
	"브리지",
	"브릿지",
	"실배포",
	"웹 호스팅",
	"웹호스팅",
	"호스팅",
	"헤드리스",
}

func runtimeBoundaryCapsuleForParts(parts ...string) string {
	if !runtimeBoundaryCapsuleRelevant(parts...) {
		return ""
	}
	return runtimeBoundaryCapsuleText()
}

func runtimeBoundaryCapsuleRelevant(parts ...string) bool {
	text := strings.ToLower(strings.Join(parts, " "))
	if strings.TrimSpace(text) == "" {
		return false
	}
	for _, term := range runtimeBoundaryTriggerTerms {
		if strings.Contains(text, term) {
			return true
		}
	}
	compact := strings.NewReplacer("-", "", "_", "", " ", "").Replace(text)
	for _, term := range []string{"lafrunner", "lafbridge", "teambridge", "mybridge", "recordonly"} {
		if strings.Contains(compact, term) {
			return true
		}
	}
	return false
}

func runtimeBoundaryCapsuleText() string {
	return strings.Join([]string{
		runtimeBoundaryCapsuleHeading,
		"- Headless reply transport is local LAF-Office reply plumbing; it does not prove hosted LAF Bridge or laf-runner is connected.",
		"- Hosted web/API can queue and control work, but cannot directly run a user's local Codex CLI, Claude Code CLI, or OpenCode CLI.",
		"- Local CLI execution needs a paired LAF Bridge/laf-runner or a managed execution backend.",
		"- record_only records chat/tasks without agent execution.",
		"- my_bridge uses a user's paired desktop bridge and execution_plans.",
		"- team_bridge model mode queues runner_jobs for a connected team runner.",
		"- The team_bridge office tool carries context between channels; it is not the same as team_bridge model mode.",
		"- For deployment or execution-availability questions, check model/availability and runner/status before concluding.",
	}, "\n")
}
