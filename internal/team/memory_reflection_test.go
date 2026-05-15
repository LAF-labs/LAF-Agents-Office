package team

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
