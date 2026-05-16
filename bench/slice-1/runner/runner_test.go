package runner

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMaterialiseCorpusRejectsUnsafeEntitySlug(t *testing.T) {
	root := t.TempDir()
	escaped := filepath.Join(filepath.Dir(root), "escape.jsonl")
	artifact := Artifact{
		OccurredAt: "2026-05-16T00:00:00Z",
		ExpectedFacts: []ExpectedFact{{
			FactID:     "fact-1",
			EntitySlug: filepath.Join("..", "..", "..", "..", "escape"),
			Triplet:    ExpectedTriplet{Subject: "person:a", Predicate: "role_at", Object: "company:b"},
			Text:       "A works at B.",
		}},
	}

	if _, err := MaterialiseCorpus(root, []Artifact{artifact}); err == nil {
		t.Fatal("expected unsafe entity_slug to be rejected")
	}
	if _, err := os.Stat(escaped); !os.IsNotExist(err) {
		t.Fatalf("unsafe slug escaped temp root: stat %s err=%v", escaped, err)
	}
}

func TestFormatReportUsesConfiguredGate(t *testing.T) {
	report := FormatReport(&Aggregate{
		TotalQueries:   10,
		PassingQueries: 9,
		PassRate:       0.90,
		Gate:           0.95,
		PerClass:       map[string]ClassBreakdown{},
	}, nil)

	if !strings.Contains(report, "Gate: PassRate >= 95%") || !strings.Contains(report, "verdict: FAIL") {
		t.Fatalf("report did not use configured gate:\n%s", report)
	}
}

func TestFormatReportSurfacesOutOfScopePrecisionFailure(t *testing.T) {
	result := QueryResult{
		Query:           Query{QueryID: "q-out", QueryClass: "out_of_scope", Query: "Who owns Atlantis?"},
		GotFactIDs:      []string{"fact-unrelated"},
		Recall:          1,
		Passed:          false,
		PrecisionFailed: true,
	}
	report := FormatReport(&Aggregate{
		TotalQueries:   1,
		PassingQueries: 0,
		PassRate:       0,
		Gate:           0.85,
		PerClass:       map[string]ClassBreakdown{},
		FailingQueries: []QueryResult{result},
	}, []QueryResult{result})

	if !strings.Contains(report, "precision_false_positive") || !strings.Contains(report, "fact-unrelated") {
		t.Fatalf("report did not surface precision failure:\n%s", report)
	}
}
