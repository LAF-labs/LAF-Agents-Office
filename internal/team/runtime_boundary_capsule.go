package team

import "strings"

const runtimeBoundaryCapsuleHeading = "Internal runtime boundary capsule:"

var runtimeBoundaryTriggerTerms = []string{
	"hosted",
	"model/availability",
	"record only",
	"record-only",
	"record_only",
	"web hosting",
	"실배포",
	"웹 호스팅",
	"웹호스팅",
	"호스팅",
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
	for _, term := range []string{"recordonly"} {
		if strings.Contains(compact, term) {
			return true
		}
	}
	return false
}

func runtimeBoundaryCapsuleText() string {
	return strings.Join([]string{
		runtimeBoundaryCapsuleHeading,
		"- Hosted web/API is the product runtime and should not depend on a user's local machine.",
		"- laf_model uses the managed cloud AI path when the workspace plan and permissions allow it.",
		"- record_only records chat/tasks without agent execution.",
		"- For deployment or execution-availability questions, check model/availability before concluding.",
	}, "\n")
}
