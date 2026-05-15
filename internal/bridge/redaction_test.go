package bridge

import (
	"strings"
	"testing"
)

func TestRedactTextRemovesSecrets(t *testing.T) {
	input := strings.Join([]string{
		"Authorization: Bearer abcdef01234567890",
		"token laf_bridge_0123456789abcdef0123456789abcdef01234567",
		"openai sk-proj-abcdefghijklmnopqrstuvwxyz123456",
		"-----BEGIN OPENSSH PRIVATE KEY-----",
		"super-secret-body",
		"-----END OPENSSH PRIVATE KEY-----",
	}, "\n")
	out := RedactText(input)
	for _, leak := range []string{
		"abcdef01234567890",
		"0123456789abcdef0123456789abcdef01234567",
		"abcdefghijklmnopqrstuvwxyz123456",
		"super-secret-body",
	} {
		if strings.Contains(out, leak) {
			t.Fatalf("redacted text leaked %q in:\n%s", leak, out)
		}
	}
}

func TestRedactValueRedactsSensitiveKeys(t *testing.T) {
	out := RedactValue(map[string]any{
		"nested": map[string]any{
			"api_key": "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
		},
	}).(map[string]any)
	nested := out["nested"].(map[string]any)
	if nested["api_key"] != "[REDACTED]" {
		t.Fatalf("api key not redacted: %#v", nested)
	}
}
