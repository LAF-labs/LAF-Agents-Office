package brokeraddr

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
)

const (
	DefaultPort      = 7890
	DefaultTokenFile = "/tmp/" + product.CLIName + "-broker-token"
)

func ResolveBaseURL() string {
	if base := envBaseURL(); base != "" {
		return base
	}
	return fmt.Sprintf("http://127.0.0.1:%d", ResolvePort())
}

func ResolvePort() int {
	if port := parsePort(os.Getenv(product.Env("BROKER_PORT"))); port > 0 {
		return port
	}
	if port := portFromBaseURL(envBaseURL()); port > 0 {
		return port
	}
	return DefaultPort
}

func ResolveTokenFile() string {
	if path := strings.TrimSpace(os.Getenv(product.Env("BROKER_TOKEN_FILE"))); path != "" {
		return path
	}
	port := ResolvePort()
	if port == DefaultPort {
		return DefaultTokenFile
	}
	return fmt.Sprintf("/tmp/%s-broker-token-%d", product.CLIName, port)
}

func parsePort(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	port, err := strconv.Atoi(raw)
	if err != nil || port <= 0 {
		return 0
	}
	return port
}

func envBaseURL() string {
	for _, key := range []string{
		product.Env("BROKER_BASE_URL"),
		product.Env("TEAM_BROKER_URL"),
	} {
		if base := strings.TrimSpace(os.Getenv(key)); base != "" {
			return strings.TrimRight(base, "/")
		}
	}
	return ""
}

func portFromBaseURL(base string) int {
	base = strings.TrimSpace(base)
	if base == "" {
		return 0
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed == nil {
		return 0
	}
	return parsePort(parsed.Port())
}
