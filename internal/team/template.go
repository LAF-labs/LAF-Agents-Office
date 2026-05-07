package team

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/LAF-labs/LAF-Agents-Office/internal/office"
	"github.com/LAF-labs/LAF-Agents-Office/internal/product"
	"github.com/LAF-labs/LAF-Agents-Office/internal/provider"
)

type generatedMemberTemplate struct {
	Slug           string   `json:"slug"`
	Name           string   `json:"name"`
	Role           string   `json:"role"`
	Expertise      []string `json:"expertise"`
	Personality    string   `json:"personality"`
	PermissionMode string   `json:"permission_mode"`
}

func (l *Launcher) GenerateMemberTemplateFromPrompt(request string) (generatedMemberTemplate, error) {
	request = strings.TrimSpace(request)
	if request == "" {
		return generatedMemberTemplate{}, fmt.Errorf("prompt is required")
	}
	if stub := strings.TrimSpace(os.Getenv(product.Env("AGENT_TEMPLATE_STUB"))); stub != "" {
		return parseGeneratedMemberTemplate(stub)
	}
	systemPrompt := l.buildPrompt(l.officeLeadSlug()) + `

You are Agent Maker, a settings-only agent designer for LAF-Office.
You are not a runtime teammate, cannot be mentioned in chat, and cannot join projects.
Your only job is to design a NEW office teammate template when the human uses Settings to add an agent.
Return exactly one JSON object and nothing else.
Do not wrap it in markdown fences.
Do not explain your reasoning.

Required schema:
{
  "slug": "lowercase-hyphen-slug",
  "name": "Display Name",
  "role": "Role / title",
  "expertise": ["area", "area"],
  "personality": "one short paragraph",
  "permission_mode": "plan"
}

Constraints:
- Never use slug "ceo", "architect", "builder", "reviewer", or "agent-maker".
- Keep the teammate narrow and domain-specific.
- Pick a role that complements the existing office rather than overlapping heavily.
- If the prompt is vague, still make a crisp decision.
- permission_mode should usually be "plan" unless the role clearly needs autonomous editing/coding.
- All generated teammates must follow the LAF work discipline: think first, keep scope small, act surgically, verify the result, and use Notebook-to-Wiki promotion instead of writing canonical memory directly.
`
	userPrompt := "Design a new office teammate from this request:\n\n" + request
	raw, err := provider.RunConfiguredOneShot(systemPrompt, userPrompt, l.cwd)
	if err != nil {
		return generatedMemberTemplate{}, err
	}
	jsonText := extractJSONObjectString(raw)
	if jsonText == "" {
		jsonText = strings.TrimSpace(raw)
	}
	return parseGeneratedMemberTemplate(jsonText)
}

func parseGeneratedMemberTemplate(raw string) (generatedMemberTemplate, error) {
	var tmpl generatedMemberTemplate
	if err := json.Unmarshal([]byte(raw), &tmpl); err != nil {
		return generatedMemberTemplate{}, fmt.Errorf("parse generated agent template: %w", err)
	}
	tmpl.Slug = normalizeChannelSlug(tmpl.Slug)
	if tmpl.Slug == "" || tmpl.Slug == "ceo" || office.IsCoreAgentSlug(tmpl.Slug) || office.IsAgentMakerSlug(tmpl.Slug) {
		return generatedMemberTemplate{}, fmt.Errorf("generated invalid slug %q", tmpl.Slug)
	}
	if tmpl.Name == "" {
		tmpl.Name = humanizeSlug(tmpl.Slug)
	}
	if tmpl.Role == "" {
		tmpl.Role = tmpl.Name
	}
	if len(tmpl.Expertise) == 0 {
		tmpl.Expertise = inferOfficeExpertise(tmpl.Slug, tmpl.Role)
	}
	if tmpl.Personality == "" {
		tmpl.Personality = inferOfficePersonality(tmpl.Slug, tmpl.Role)
	}
	if tmpl.PermissionMode == "" {
		tmpl.PermissionMode = "plan"
	} else {
		tmpl.PermissionMode = normalizeGeneratedPermissionMode(tmpl.PermissionMode)
	}
	return tmpl, nil
}

func normalizeGeneratedPermissionMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "auto":
		return "auto"
	default:
		return "plan"
	}
}

type generatedChannelTemplate struct {
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Members     []string `json:"members"`
}

func (l *Launcher) GenerateChannelTemplateFromPrompt(request string) (generatedChannelTemplate, error) {
	request = strings.TrimSpace(request)
	if request == "" {
		return generatedChannelTemplate{}, fmt.Errorf("prompt is required")
	}
	if stub := strings.TrimSpace(os.Getenv(product.Env("CHANNEL_TEMPLATE_STUB"))); stub != "" {
		return parseGeneratedChannelTemplate(stub)
	}
	systemPrompt := l.buildPrompt(l.officeLeadSlug()) + `

You are designing a NEW office channel for LAF-Office.
Return exactly one JSON object and nothing else.
Do not wrap it in markdown fences.
Do not explain your reasoning.

Required schema:
{
  "slug": "lowercase-hyphen-slug",
  "name": "Display Name",
  "description": "One sentence explaining the channel purpose",
  "members": ["architect", "relevant-member-slug"]
}

Constraints:
- Never use slug "general".
- Keep the channel focused on a specific topic or workstream.
- Always include "architect" in members.
- Pick members that match the channel topic from the existing office roster.
- If the prompt is vague, still make a crisp decision.
`
	userPrompt := "Design a new office channel from this request:\n\n" + request
	raw, err := provider.RunConfiguredOneShot(systemPrompt, userPrompt, l.cwd)
	if err != nil {
		return generatedChannelTemplate{}, err
	}
	jsonText := extractJSONObjectString(raw)
	if jsonText == "" {
		jsonText = strings.TrimSpace(raw)
	}
	return parseGeneratedChannelTemplate(jsonText)
}

func parseGeneratedChannelTemplate(raw string) (generatedChannelTemplate, error) {
	var tmpl generatedChannelTemplate
	if err := json.Unmarshal([]byte(raw), &tmpl); err != nil {
		return generatedChannelTemplate{}, fmt.Errorf("parse generated channel template: %w", err)
	}
	tmpl.Slug = normalizeChannelSlug(tmpl.Slug)
	if tmpl.Slug == "" || tmpl.Slug == "general" {
		return generatedChannelTemplate{}, fmt.Errorf("generated invalid slug %q", tmpl.Slug)
	}
	if tmpl.Name == "" {
		tmpl.Name = humanizeSlug(tmpl.Slug)
	}
	if tmpl.Description == "" {
		tmpl.Description = defaultTeamChannelDescription(tmpl.Slug, tmpl.Name)
	}
	members := make([]string, 0, len(tmpl.Members)+1)
	seen := map[string]struct{}{}
	for _, m := range tmpl.Members {
		slug := normalizeActorSlug(m)
		if slug == "" {
			continue
		}
		if _, ok := seen[slug]; ok {
			continue
		}
		seen[slug] = struct{}{}
		members = append(members, slug)
	}
	if _, ok := seen[office.DefaultLeadAgentSlug]; !ok {
		members = append([]string{office.DefaultLeadAgentSlug}, members...)
	}
	tmpl.Members = members
	return tmpl, nil
}

func extractJSONObjectString(raw string) string {
	start := strings.Index(raw, "{")
	if start < 0 {
		return ""
	}
	depth := 0
	inString := false
	escaped := false
	for i := start; i < len(raw); i++ {
		ch := raw[i]
		if escaped {
			escaped = false
			continue
		}
		if inString {
			if ch == '\\' {
				escaped = true
			} else if ch == '"' {
				inString = false
			}
			continue
		}
		switch ch {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return raw[start : i+1]
			}
		}
	}
	return ""
}
