package team

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func newWorkspaceSearchTestServer(t *testing.T) (*httptest.Server, *Broker, func()) {
	t.Helper()
	root := filepath.Join(t.TempDir(), "wiki")
	backup := filepath.Join(t.TempDir(), "wiki.bak")
	repo := NewRepoAt(root, backup)
	if err := repo.Init(context.Background()); err != nil {
		t.Fatalf("init wiki repo: %v", err)
	}
	b := newTestBroker(t)
	worker := NewWikiWorker(repo, b)
	ctx, cancel := context.WithCancel(context.Background())
	worker.Start(ctx)
	b.mu.Lock()
	b.wikiWorker = worker
	b.mu.Unlock()

	mux := http.NewServeMux()
	mux.HandleFunc("/workspace/search", b.requireAuth(b.handleWorkspaceSearch))
	srv := httptest.NewServer(mux)
	return srv, b, func() {
		srv.Close()
		cancel()
		worker.Stop()
	}
}

func TestWorkspaceSearchOnlySearchesWikiProjectsAndTaskChats(t *testing.T) {
	srv, b, teardown := newWorkspaceSearchTestServer(t)
	defer teardown()
	worker := b.WikiWorker()
	ctx := context.Background()
	if _, _, err := worker.Enqueue(ctx, "ceo", "team/projects/orion.md", "# Orion\n\nLaunch matrix decision lives here.\n", "create", "seed wiki"); err != nil {
		t.Fatalf("seed wiki: %v", err)
	}
	root, err := b.PostMessage("human", "general", "Please review the launch matrix", nil, "")
	if err != nil {
		t.Fatalf("post root: %v", err)
	}
	if _, err := b.PostMessage("ceo", "general", "Launch matrix thread evidence", nil, root.ID); err != nil {
		t.Fatalf("post reply: %v", err)
	}

	b.mu.Lock()
	b.projects = append(b.projects, teamProject{
		ID:          "orion",
		Name:        "Orion Launch",
		Description: "Launch matrix project",
		Status:      "active",
		Channel:     "general",
		CreatedAt:   "2026-05-13T00:00:00Z",
		UpdatedAt:   "2026-05-13T00:01:00Z",
	})
	b.tasks = append(b.tasks, teamTask{
		ID:        "task-orion",
		ProjectID: "orion",
		Channel:   "general",
		Title:     "Review launch matrix",
		Details:   "Use the launch matrix before coding.",
		Owner:     "backend",
		Status:    "in_progress",
		ThreadID:  root.ID,
		CreatedAt: "2026-05-13T00:00:00Z",
		UpdatedAt: "2026-05-13T00:01:00Z",
	})
	b.mu.Unlock()

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/workspace/search?q=launch%20matrix&limit=20", nil)
	req.Header.Set("Authorization", "Bearer "+b.Token())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status %d: %s", res.StatusCode, string(body))
	}

	var payload struct {
		Hits []workspaceSearchHit `json:"hits"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	sources := map[string]bool{}
	for _, hit := range payload.Hits {
		sources[hit.Source] = true
		switch hit.Source {
		case "wiki", "project", "task", "chat":
		default:
			t.Fatalf("unexpected source %q in %+v", hit.Source, payload.Hits)
		}
	}
	for _, want := range []string{"wiki", "project", "task", "chat"} {
		if !sources[want] {
			t.Fatalf("missing source %q in hits: %+v", want, payload.Hits)
		}
	}
}

func TestWorkspaceSearchChatIgnoresNonTaskThreads(t *testing.T) {
	srv, b, teardown := newWorkspaceSearchTestServer(t)
	defer teardown()
	if _, err := b.PostMessage("human", "general", "launch matrix outside task", nil, ""); err != nil {
		t.Fatalf("post unrelated: %v", err)
	}

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/workspace/search?q=launch%20matrix&scopes=chat", nil)
	req.Header.Set("Authorization", "Bearer "+b.Token())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()

	var payload struct {
		Hits []workspaceSearchHit `json:"hits"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Hits) != 0 {
		t.Fatalf("expected no chat hits outside task threads, got %+v", payload.Hits)
	}
}

func TestWorkspaceSearchRejectsUnknownScope(t *testing.T) {
	srv, b, teardown := newWorkspaceSearchTestServer(t)
	defer teardown()
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/workspace/search?q=launch&scopes=wiki,external", nil)
	req.Header.Set("Authorization", "Bearer "+b.Token())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("status %d, want 400: %s", res.StatusCode, string(body))
	}
}
