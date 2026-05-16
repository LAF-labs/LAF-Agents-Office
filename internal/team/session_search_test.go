package team

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSessionSearchFindsLiveMessages(t *testing.T) {
	b := newTestBroker(t)
	msg, err := b.PostMessage("human", "general", "We decided the billing launch needs a reversible rollout.", nil, "")
	if err != nil {
		t.Fatalf("post message: %v", err)
	}

	hits, err := b.SearchSessions(sessionSearchRequest{Query: "billing launch", Limit: 5})
	if err != nil {
		t.Fatalf("search sessions: %v", err)
	}
	if len(hits) == 0 {
		t.Fatal("expected live session hit")
	}
	if hits[0].MessageID != msg.ID || hits[0].Archived {
		t.Fatalf("unexpected hit: %+v", hits[0])
	}
	if !strings.Contains(hits[0].Snippet, "billing launch") {
		t.Fatalf("expected snippet to include query, got %q", hits[0].Snippet)
	}
}

func TestSessionSearchSnippetHandlesKoreanText(t *testing.T) {
	prefix := strings.Repeat("가나다라마바사아자차카타파하", 10)
	content := prefix + " 홈 채팅의 핵심 문구는 파란 혜성 가격 정책이었다."

	snippet := sessionSearchSnippet(content, "파란 혜성")
	if !strings.Contains(snippet, "파란 혜성") {
		t.Fatalf("expected Korean query in snippet, got %q", snippet)
	}
	if !strings.HasPrefix(snippet, "...") {
		t.Fatalf("expected long prefix to be trimmed, got %q", snippet)
	}
}

func TestSessionSearchSuppressesSingleTokenNoiseForMultiTokenQuery(t *testing.T) {
	b := newTestBroker(t)
	if _, err := b.PostMessage("human", "general", "The rollout notes are ready.", nil, ""); err != nil {
		t.Fatalf("post noisy message: %v", err)
	}
	want, err := b.PostMessage("human", "general", "Alpha launch needs a reversible rollout.", nil, "")
	if err != nil {
		t.Fatalf("post target message: %v", err)
	}

	hits, err := b.SearchSessions(sessionSearchRequest{Query: "alpha reversible rollout", Limit: 5})
	if err != nil {
		t.Fatalf("search sessions: %v", err)
	}
	if len(hits) != 1 {
		t.Fatalf("expected one precise hit, got %+v", hits)
	}
	if hits[0].MessageID != want.ID {
		t.Fatalf("expected target hit %s, got %+v", want.ID, hits[0])
	}
}

func TestSessionSearchUsesTitleForSnippet(t *testing.T) {
	b := newTestBroker(t)
	msg, _, err := b.PostAutomationMessage("automation", "general", "Blue comet launch recap", "The body only says approved.", "event-title-search", "test", "Test", nil, "")
	if err != nil {
		t.Fatalf("post automation message: %v", err)
	}

	hits, err := b.SearchSessions(sessionSearchRequest{Query: "blue comet", Limit: 5})
	if err != nil {
		t.Fatalf("search sessions: %v", err)
	}
	if len(hits) != 1 || hits[0].MessageID != msg.ID {
		t.Fatalf("expected title hit, got %+v", hits)
	}
	if !strings.Contains(hits[0].Snippet, "Blue comet launch recap") {
		t.Fatalf("expected title in snippet, got %q", hits[0].Snippet)
	}
}

func TestHomeCompactionArchivesSearchableMessages(t *testing.T) {
	b := newTestBroker(t)
	threadID := "home:team:user"
	now := time.Now().UTC().Format(time.RFC3339)
	b.mu.Lock()
	for i := 0; i < homeThreadCompactionThreshold+5; i++ {
		content := fmt.Sprintf("ordinary home message %03d", i)
		if i == 0 {
			content = "The original launch phrase was blue comet pricing."
		}
		b.messages = append(b.messages, channelMessage{
			ID:        fmt.Sprintf("msg-%d", i+1),
			From:      "human",
			Channel:   "general",
			Content:   content,
			ReplyTo:   threadID,
			Timestamp: now,
		})
	}
	b.compactHomeThreadLocked(threadID, now)
	archived := len(b.sessionArchive)
	b.mu.Unlock()
	if archived == 0 {
		t.Fatal("expected home compaction to archive compacted messages")
	}

	hits, err := b.SearchSessions(sessionSearchRequest{Query: "blue comet", Scope: "home", Limit: 5})
	if err != nil {
		t.Fatalf("search sessions: %v", err)
	}
	if len(hits) == 0 {
		t.Fatal("expected archived home session hit")
	}
	if !hits[0].Archived || hits[0].Source != "home_compaction" {
		t.Fatalf("expected archived compaction hit, got %+v", hits[0])
	}
}

func TestSessionSearchHTTPRoute(t *testing.T) {
	b := newTestBroker(t)
	if _, err := b.PostMessage("human", "general", "The onboarding script should ask for the CRM source first.", nil, ""); err != nil {
		t.Fatalf("post message: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/session/search?q=CRM%20source&limit=3", nil)
	rec := httptest.NewRecorder()
	b.handleSessionSearch(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("session search status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Hits []sessionSearchHit `json:"hits"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if len(body.Hits) != 1 || !strings.Contains(body.Hits[0].Snippet, "CRM source") {
		t.Fatalf("unexpected hits: %+v", body.Hits)
	}
}
