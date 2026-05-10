package onboarding

import (
	"path/filepath"
	"runtime"
	"testing"
)

func TestDefaultTemplatesReturnsFiveItems(t *testing.T) {
	templates := DefaultTemplates()
	if len(templates) != 5 {
		t.Fatalf("DefaultTemplates: got %d items, want 5", len(templates))
	}
}

func TestDefaultTemplatesNonEmptyFields(t *testing.T) {
	for _, tmpl := range DefaultTemplates() {
		if tmpl.ID == "" {
			t.Errorf("template %+v: ID must not be empty", tmpl)
		}
		if tmpl.Title == "" {
			t.Errorf("template %q: Title must not be empty", tmpl.ID)
		}
		if tmpl.OwnerSlug == "" {
			t.Errorf("template %q: OwnerSlug must not be empty", tmpl.ID)
		}
		if tmpl.Description == "" {
			t.Errorf("template %q: Description must not be empty", tmpl.ID)
		}
	}
}

func TestDefaultTemplatesExpectedIDs(t *testing.T) {
	wantIDs := []string{"product-plan", "repo", "implementation-task", "project-wiki", "automation-map"}
	templates := DefaultTemplates()
	for i, want := range wantIDs {
		if templates[i].ID != want {
			t.Errorf("templates[%d].ID: got %q, want %q", i, templates[i].ID, want)
		}
	}
}

func TestDefaultTemplatesOwnerSlugs(t *testing.T) {
	// Verify the expected owner distribution for the compact default team.
	counts := map[string]int{}
	for _, tmpl := range DefaultTemplates() {
		counts[tmpl.OwnerSlug]++
	}
	if counts["ceo"] != 1 {
		t.Errorf("expected 1 ceo template, got %d", counts["ceo"])
	}
	if counts["fe"] != 1 {
		t.Errorf("expected 1 fe template, got %d", counts["fe"])
	}
	if counts["be"] != 2 {
		t.Errorf("expected 2 be templates, got %d", counts["be"])
	}
	if counts["reviewer"] != 1 {
		t.Errorf("expected 1 reviewer template, got %d", counts["reviewer"])
	}
}

func TestDefaultTemplatesUniqueIDs(t *testing.T) {
	seen := map[string]bool{}
	for _, tmpl := range DefaultTemplates() {
		if seen[tmpl.ID] {
			t.Errorf("duplicate template ID: %q", tmpl.ID)
		}
		seen[tmpl.ID] = true
	}
}

func TestTemplatesForPackRouting(t *testing.T) {
	cases := []struct {
		slug    string
		firstID string
	}{
		{"", "product-plan"},              // fallback to default
		{"founding-team", "product-plan"}, // explicit default
		{"revops", "product-plan"},        // retired legacy alias falls through
		{"from-scratch", "objective"},     // explicit blank-slate selector
		{"__blank_slate__", "objective"},  // current runtime selector
		{"unknown-pack", "product-plan"},  // unknown falls through to default
	}
	for _, tc := range cases {
		got := TemplatesForPack(tc.slug)
		if len(got) == 0 || got[0].ID != tc.firstID {
			t.Errorf("TemplatesForPack(%q): first ID got %q, want %q", tc.slug, got[0].ID, tc.firstID)
		}
	}
}

func TestTemplatesForSelectionUsesBlankSlateTemplates(t *testing.T) {
	for _, selection := range []string{"from-scratch", blankSlateStarterTemplateID} {
		got := TemplatesForSelection("", selection)
		if len(got) == 0 {
			t.Fatalf("expected blank-slate templates for %q", selection)
		}
		if got[0].ID != "objective" {
			t.Fatalf("unexpected first blank-slate template for %q: %+v", selection, got[0])
		}
	}
}

func TestBlankSlateTemplatesDoNotRouteStarterLoopThroughReviewer(t *testing.T) {
	got := BlankSlateTemplates()
	for _, tmpl := range got {
		if tmpl.OwnerSlug == "reviewer" {
			t.Fatalf("blank-slate template %q should not be reviewer-owned: %+v", tmpl.ID, tmpl)
		}
	}
}

func TestTemplatesForSelectionUsesOperationBlueprintStarterTasks(t *testing.T) {
	repoRoot := onboardingTestRepoRoot(t)
	got := TemplatesForSelection(repoRoot, "multi-agent-workflow-consulting")
	if len(got) == 0 {
		t.Fatal("expected blueprint-backed onboarding templates")
	}
	if got[0].Title != "Turn the directive into a client operating plan" {
		t.Fatalf("unexpected first blueprint-backed template: %+v", got[0])
	}
	if got[0].OwnerSlug != "planner" {
		t.Fatalf("expected planner-owned starter template, got %+v", got[0])
	}
}

func onboardingTestRepoRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}
