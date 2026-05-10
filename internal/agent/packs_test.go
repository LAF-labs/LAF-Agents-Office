package agent

import (
	"testing"

	"github.com/LAF-labs/LAF-Agents-Office/internal/office"
)

func TestPacksRegistered(t *testing.T) {
	packs := ListLegacyPacks()
	if len(packs) != 3 {
		t.Fatalf("expected 3 packs, got %d", len(packs))
	}
	founding := LookupLegacyPack("founding-team")
	if founding == nil {
		t.Fatal("founding-team pack not found")
	}
	if founding.LeadSlug != office.DefaultLeadAgentSlug {
		t.Errorf("expected lead slug %q, got '%s'", office.DefaultLeadAgentSlug, founding.LeadSlug)
	}
	if len(founding.Agents) != 4 {
		t.Errorf("expected 4 agents in founding team, got %d", len(founding.Agents))
	}
	foundBackend := false
	for _, a := range founding.Agents {
		if a.Slug == office.BackendAgentSlug && a.Name == "Backend Engineer" {
			foundBackend = true
			break
		}
	}
	if !foundBackend {
		t.Error("expected founding team to include Backend Engineer")
	}
}

func TestGetPackReturnsNilForUnknown(t *testing.T) {
	if LookupLegacyPack("nonexistent") != nil {
		t.Error("expected nil for unknown pack")
	}
}

func TestAllPacksHaveLeadInAgents(t *testing.T) {
	for _, pack := range ListLegacyPacks() {
		found := false
		for _, a := range pack.Agents {
			if a.Slug == pack.LeadSlug {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("pack %s: lead slug %s not found in agents", pack.Slug, pack.LeadSlug)
		}
	}
}

func TestCodingTeamPack(t *testing.T) {
	p := LookupLegacyPack("coding-team")
	if p == nil {
		t.Fatal("coding-team pack not found")
	}
	if p.LeadSlug != office.DefaultLeadAgentSlug {
		t.Errorf("expected lead %q, got '%s'", office.DefaultLeadAgentSlug, p.LeadSlug)
	}
	if len(p.Agents) != 4 {
		t.Errorf("expected 4 agents, got %d", len(p.Agents))
	}
}

func TestRetiredBusinessPacksAreNotRegistered(t *testing.T) {
	for _, slug := range []string{"lead-gen-agency", "revops"} {
		if LookupLegacyPack(slug) != nil {
			t.Fatalf("retired business pack %q should not be registered", slug)
		}
	}
}
