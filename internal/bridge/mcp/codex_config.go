package mcp

import (
	"fmt"
	"strconv"
	"strings"
)

const CodexServerID = "laf-bridge-context"

func CodexConfigOverrides(command string, args []string, envVars []string) []string {
	command = strings.TrimSpace(command)
	if command == "" {
		return nil
	}
	prefix := "mcp_servers." + CodexServerID
	overrides := []string{
		fmt.Sprintf("%s.command=%s", prefix, strconv.Quote(command)),
	}
	if len(args) > 0 {
		overrides = append(overrides, fmt.Sprintf("%s.args=%s", prefix, tomlStringArray(args)))
	}
	if len(envVars) > 0 {
		overrides = append(overrides, fmt.Sprintf("%s.env_vars=%s", prefix, tomlStringArray(envVars)))
	}
	overrides = append(overrides,
		fmt.Sprintf("%s.enabled=true", prefix),
		fmt.Sprintf("%s.required=true", prefix),
	)
	return overrides
}

func tomlStringArray(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		quoted = append(quoted, strconv.Quote(value))
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}
