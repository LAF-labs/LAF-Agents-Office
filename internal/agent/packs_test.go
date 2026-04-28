package agent

import "testing"

func TestPacksRegistered(t *testing.T) {
	packs := ListLegacyPacks()
	if len(packs) != 3 {
		t.Fatalf("expected 3 packs, got %d", len(packs))
	}
	founding := LookupLegacyPack("founding-team")
	if founding == nil {
		t.Fatal("founding-team pack not found")
	}
	if founding.LeadSlug != "ceo" {
		t.Errorf("expected lead slug 'ceo', got '%s'", founding.LeadSlug)
	}
	if len(founding.Agents) != 6 {
		t.Errorf("expected 6 agents in founding team, got %d", len(founding.Agents))
	}
	foundAI := false
	for _, a := range founding.Agents {
		if a.Slug == "ai" && a.Name == "AI Engineer" {
			foundAI = true
			break
		}
	}
	if !foundAI {
		t.Error("expected founding team to include AI Engineer")
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
	if p.LeadSlug != "ceo" {
		t.Errorf("expected lead 'ceo', got '%s'", p.LeadSlug)
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
