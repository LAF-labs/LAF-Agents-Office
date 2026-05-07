package team

import (
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/office"
)

const (
	SessionModeOffice   = "office"
	SessionModeOneOnOne = "1o1"

	DefaultOneOnOneAgent = office.DefaultLeadAgentSlug
)

func NormalizeSessionMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case SessionModeOneOnOne, "1:1", "one-on-one", "one_on_one", "1on1", "solo":
		return SessionModeOneOnOne
	default:
		return SessionModeOffice
	}
}

func NormalizeOneOnOneAgent(slug string) string {
	slug = strings.ToLower(strings.TrimSpace(slug))
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = strings.ReplaceAll(slug, "_", "-")
	if slug == "" {
		return DefaultOneOnOneAgent
	}
	return slug
}
