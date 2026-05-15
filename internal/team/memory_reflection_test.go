package team

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMemoryCandidateCapturedFromDecisionMessage(t *testing.T) {
	b := newTestBroker(t)
	msg, err := b.PostMessage("human", "general", "We decided the onboarding source of truth is CRM first.", nil, "")
	if err != nil {
		t.Fatalf("post message: %v", err)
	}

	candidates := b.ListMemoryCandidates(memoryCandidateFilter{Status: "pending", Limit: 5})
	if len(candidates) != 1 {
		t.Fatalf("expected one memory candidate, got %+v", candidates)
	}
	if candidates[0].SourceMessageID != msg.ID || candidates[0].Target != "core:team_memory" {
		t.Fatalf("unexpected candidate: %+v", candidates[0])
	}
}

func TestMemoryCandidateSkipsSensitiveContent(t *testing.T) {
	b := newTestBroker(t)
	if _, err := b.PostMessage("human", "general", "We decided the API key is secret and should be remembered.", nil, ""); err != nil {
		t.Fatalf("post message: %v", err)
	}
	if candidates := b.ListMemoryCandidates(memoryCandidateFilter{Status: "pending", Limit: 5}); len(candidates) != 0 {
		t.Fatalf("expected sensitive message to be skipped, got %+v", candidates)
	}
}

func TestMemoryCandidatesReflectRouteDedupesRecentMessages(t *testing.T) {
	b := newTestBroker(t)
	if _, err := b.PostMessage("human", "general", "I prefer concise Korean progress updates from now on.", nil, ""); err != nil {
		t.Fatalf("post message: %v", err)
	}

	body := strings.NewReader(`{"channel":"general","limit":5}`)
	req := httptest.NewRequest(http.MethodPost, "/memory/candidates/reflect", body)
	rec := httptest.NewRecorder()
	b.handleMemoryCandidatesReflect(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("reflect status %d body %s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Candidates []memoryCandidate `json:"candidates"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if len(payload.Candidates) != 1 {
		t.Fatalf("expected one reflected candidate, got %+v", payload.Candidates)
	}
	if payload.Candidates[0].Target != "core:user_profile" {
		t.Fatalf("expected user profile target, got %+v", payload.Candidates[0])
	}
	if stored := b.ListMemoryCandidates(memoryCandidateFilter{Status: "pending", Limit: 5}); len(stored) != 1 {
		t.Fatalf("expected deduped storage, got %+v", stored)
	}
}

func TestMemoryCandidateDedupesEquivalentContent(t *testing.T) {
	b := newTestBroker(t)
	if _, err := b.PostMessage("human", "general", "We decided the onboarding source of truth is CRM first.", nil, ""); err != nil {
		t.Fatalf("post first message: %v", err)
	}
	if _, err := b.PostMessage("human", "general", "We decided CRM first is the onboarding source of truth.", nil, ""); err != nil {
		t.Fatalf("post second message: %v", err)
	}

	candidates := b.ListMemoryCandidates(memoryCandidateFilter{Status: "pending", Limit: 5})
	if len(candidates) != 1 {
		t.Fatalf("expected equivalent candidate to dedupe, got %+v", candidates)
	}
	if candidates[0].Fingerprint == "" {
		t.Fatalf("expected candidate fingerprint, got %+v", candidates[0])
	}
}

func TestIgnoredMemoryCandidateSuppressesEquivalentFutureCandidate(t *testing.T) {
	b := newTestBroker(t)
	if _, err := b.PostMessage("human", "general", "I prefer concise Korean progress updates from now on.", nil, ""); err != nil {
		t.Fatalf("post message: %v", err)
	}
	candidates := b.ListMemoryCandidates(memoryCandidateFilter{Status: "pending", Limit: 5})
	if len(candidates) != 1 {
		t.Fatalf("expected one candidate, got %+v", candidates)
	}
	if _, err := b.MarkMemoryCandidateIgnored(candidates[0].ID); err != nil {
		t.Fatalf("ignore candidate: %v", err)
	}
	if _, err := b.PostMessage("human", "general", "From now on I prefer concise Korean progress updates.", nil, ""); err != nil {
		t.Fatalf("post equivalent message: %v", err)
	}
	if pending := b.ListMemoryCandidates(memoryCandidateFilter{Status: "pending", Limit: 5}); len(pending) != 0 {
		t.Fatalf("expected ignored equivalent to suppress future pending candidate, got %+v", pending)
	}
}

func TestMemoryCandidatePrunesOldIgnoredOnReflect(t *testing.T) {
	b := newTestBroker(t)
	old := time.Now().Add(-(memoryCandidateIgnoredTTL + time.Hour)).UTC().Format(time.RFC3339)
	b.mu.Lock()
	b.memoryCandidates = append(b.memoryCandidates, memoryCandidate{
		ID:          "memory-candidate-old",
		Status:      memoryCandidateStatusIgnored,
		Target:      "core:team_memory",
		Content:     "We decided this old candidate can be discarded.",
		Fingerprint: "core:team_memory:discarded old",
		CreatedAt:   old,
		UpdatedAt:   old,
	})
	b.mu.Unlock()

	if _, err := b.ReflectMemoryCandidates(memoryReflectRequest{Limit: 5}); err != nil {
		t.Fatalf("reflect memory candidates: %v", err)
	}
	if got := b.ListMemoryCandidates(memoryCandidateFilter{Status: "all", Limit: 5}); len(got) != 0 {
		t.Fatalf("expected old ignored candidate to be pruned, got %+v", got)
	}
}
