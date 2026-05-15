package mcp

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"sync"
)

type StaticContextData struct {
	TaskContext TaskContext `json:"task_context"`
	Wiki        []WikiHit   `json:"wiki"`
}

type StaticContextStore struct {
	mu       sync.Mutex
	data     StaticContextData
	receipts []ReceiptResult
}

func LoadStaticContextStore(path string) (*StaticContextStore, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return &StaticContextStore{}, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var data StaticContextData
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}
	return &StaticContextStore{data: data}, nil
}

func (s *StaticContextStore) TaskContext(_ context.Context, claims TokenClaims) (TaskContext, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.data.TaskContext
	if strings.TrimSpace(out.TaskID) == "" {
		out.TaskID = claims.TaskID
	}
	if strings.TrimSpace(out.ProjectID) == "" {
		out.ProjectID = claims.ProjectID
	}
	if strings.TrimSpace(out.Text) == "" {
		out.Text = "No local LAF task context file is configured for this bridge run."
	}
	return out, nil
}

func (s *StaticContextStore) WikiSearch(_ context.Context, _ TokenClaims, query string, limit int) ([]WikiHit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	query = strings.ToLower(strings.TrimSpace(query))
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	out := make([]WikiHit, 0, limit)
	for _, hit := range s.data.Wiki {
		haystack := strings.ToLower(hit.Path + "\n" + hit.Excerpt)
		if query != "" && !strings.Contains(haystack, query) {
			continue
		}
		out = append(out, hit)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (s *StaticContextStore) WriteReceipt(_ context.Context, claims TokenClaims, draft ReceiptDraft) (ReceiptResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := ReceiptResult{
		ID:      "local-receipt-" + strings.TrimSpace(claims.PlanID),
		PlanID:  strings.TrimSpace(draft.PlanID),
		Status:  strings.TrimSpace(draft.Status),
		Summary: strings.TrimSpace(draft.Summary),
	}
	if result.PlanID == "" {
		result.PlanID = claims.PlanID
	}
	s.receipts = append(s.receipts, result)
	return result, nil
}
