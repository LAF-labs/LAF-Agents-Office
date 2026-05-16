package main

import (
	"math/rand"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBuildSupersedingArtifactKeepsCurrentCompany(t *testing.T) {
	s := newGenState(rand.New(rand.NewSource(7)))
	person := people[0]
	currentObject := "company:blueshift"
	s.facts[factKey(person.Slug, "role_at")] = []factRef{{FactID: "previous-role-fact", Object: currentObject}}
	s.personCompany[person.Slug] = "blueshift"

	artifact := buildSupersedingArtifact(s, 42, time.Date(2026, 2, 1, 9, 0, 0, 0, time.UTC))
	if len(artifact.ExpectedFacts) != 1 {
		t.Fatalf("ExpectedFacts len = %d, want 1", len(artifact.ExpectedFacts))
	}
	got := artifact.ExpectedFacts[0]
	if got.Triplet.Object != currentObject {
		t.Fatalf("superseding object = %q, want %q", got.Triplet.Object, currentObject)
	}
	if len(got.Supersedes) != 1 || got.Supersedes[0] != "previous-role-fact" {
		t.Fatalf("supersedes = %#v, want previous-role-fact", got.Supersedes)
	}
	if s.personCompany[person.Slug] != "blueshift" {
		t.Fatalf("personCompany = %q, want blueshift", s.personCompany[person.Slug])
	}
}

func TestWriteJSONLPreservesExistingFileOnUnsupportedRows(t *testing.T) {
	path := filepath.Join(t.TempDir(), "corpus.jsonl")
	if err := os.WriteFile(path, []byte("existing\n"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	if err := writeJSONL(path, struct{}{}); err == nil {
		t.Fatal("expected unsupported row type error")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if string(raw) != "existing\n" {
		t.Fatalf("file was modified: %q", string(raw))
	}
}
