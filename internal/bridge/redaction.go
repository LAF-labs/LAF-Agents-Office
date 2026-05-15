package bridge

import (
	"regexp"
	"strings"
)

var bridgeRedactionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)Bearer\s+[A-Za-z0-9._~+/=-]{10,}`),
	regexp.MustCompile(`laf_bridge_[A-Fa-f0-9]{20,}`),
	regexp.MustCompile(`lafb_[A-Za-z0-9_-]{20,}`),
	regexp.MustCompile(`gh[pousr]_[A-Za-z0-9_]{20,}`),
	regexp.MustCompile(`sk-(?:proj-)?[A-Za-z0-9_-]{20,}`),
	regexp.MustCompile(`(?s)-----BEGIN (?:OPENSSH |RSA |DSA |EC |ENCRYPTED |PGP )?PRIVATE KEY-----.*?-----END (?:OPENSSH |RSA |DSA |EC |ENCRYPTED |PGP )?PRIVATE KEY-----`),
}

func RedactText(value string) string {
	out := value
	for _, pattern := range bridgeRedactionPatterns {
		out = pattern.ReplaceAllStringFunc(out, func(match string) string {
			upper := strings.ToUpper(match)
			switch {
			case strings.HasPrefix(strings.ToLower(match), "bearer "):
				return "Bearer [REDACTED]"
			case strings.HasPrefix(match, "laf_bridge_"):
				return "laf_bridge_[REDACTED]"
			case strings.HasPrefix(match, "lafb_"):
				return "lafb_[REDACTED]"
			case strings.HasPrefix(match, "gh"):
				return "gh_[REDACTED]"
			case strings.HasPrefix(match, "sk-"):
				return "sk-[REDACTED]"
			case strings.Contains(upper, "PRIVATE KEY"):
				return "-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----"
			default:
				return "[REDACTED]"
			}
		})
	}
	return out
}

func RedactValue(value any) any {
	switch typed := value.(type) {
	case string:
		return RedactText(typed)
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = RedactValue(item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			if isSensitiveKey(key) {
				out[key] = "[REDACTED]"
				continue
			}
			out[key] = RedactValue(item)
		}
		return out
	default:
		return value
	}
}

func isSensitiveKey(key string) bool {
	return regexp.MustCompile(`(?i)(token|secret|password|api[_-]?key|private[_-]?key)`).MatchString(key)
}
