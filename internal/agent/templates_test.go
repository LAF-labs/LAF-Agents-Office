package agent

import "testing"

func TestTemplateLookup(t *testing.T) {
	cases := []struct {
		slug string
		name string
	}{
		{"team-lead", "Team Lead"},
		{"founding-agent", "Team Lead"},
		{"product-manager", "Product Manager"},
		{"founding-engineer", "Founding Engineer"},
		{"ai-engineer", "AI Engineer"},
		{"designer", "Designer"},
	}

	for _, tc := range cases {
		cfg, ok := LookupLegacyTemplate(tc.slug)
		if !ok {
			t.Errorf("template %q not found", tc.slug)
			continue
		}
		if cfg.Name != tc.name {
			t.Errorf("template %q: got name %q, want %q", tc.slug, cfg.Name, tc.name)
		}
		if len(cfg.Expertise) == 0 {
			t.Errorf("template %q: expertise is empty", tc.slug)
		}
		if len(cfg.Tools) == 0 {
			t.Errorf("template %q: tools is empty", tc.slug)
		}
	}
}

func TestTemplateCount(t *testing.T) {
	if got := len(LegacyTemplateNames()); got != 6 {
		t.Errorf("expected 6 templates, got %d", got)
	}
}
