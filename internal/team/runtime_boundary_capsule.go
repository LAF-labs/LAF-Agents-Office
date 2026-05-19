package team

import "strings"

const runtimeBoundaryCapsuleHeading = "Internal runtime boundary capsule:"

var runtimeBoundaryTriggerTerms = []string{
	"bridge/pairing",
	"codex cli",
	"claude code cli",
	"execution plan",
	"headless reply",
	"headless runtime",
	"headless transport",
	"hosted",
	"laf bridge",
	"local cli",
	"model/availability",
	"my bridge",
	"my-bridge",
	"my_bridge",
	"paired bridge",
	"record only",
	"record-only",
	"record_only",
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
	for _, term := range []string{"lafbridge", "mybridge", "recordonly"} {
		if strings.Contains(compact, term) {
			return true
		}
	}
	return false
}

func runtimeBoundaryCapsuleText() string {
	return strings.Join([]string{
		runtimeBoundaryCapsuleHeading,
		"- Headless reply transport is local LAF-Office reply plumbing; it does not prove hosted LAF Bridge is connected.",
		"- Hosted web/API can queue and control work, but cannot directly run a user's local Codex CLI or Claude Code CLI.",
		"- Local CLI execution needs a paired LAF Bridge or a managed execution backend.",
		"- record_only records chat/tasks without agent execution.",
		"- my_bridge uses a user's paired LAF Bridge and execution_plans.",
		"- For deployment or execution-availability questions, check model/availability and Bridge availability before concluding.",
	}, "\n")
}
