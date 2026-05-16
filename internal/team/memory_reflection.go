package team

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	memoryCandidateStatusPending = "pending"
	memoryCandidateStatusIgnored = "ignored"

	memoryCandidateDefaultLimit = 8
	memoryCandidateMaxLimit     = 25
	memoryCandidateMaxStored    = 120
	memoryCandidateMaxRunes     = 420

	memoryCandidatePendingTTL = 30 * 24 * time.Hour
	memoryCandidateIgnoredTTL = 7 * 24 * time.Hour
)

type memoryCandidate struct {
	ID              string `json:"id"`
	Status          string `json:"status"`
	Target          string `json:"target"`
	Reason          string `json:"reason"`
	Content         string `json:"content"`
	Fingerprint     string `json:"fingerprint,omitempty"`
	SourceMessageID string `json:"source_message_id,omitempty"`
	ThreadID        string `json:"thread_id,omitempty"`
	Channel         string `json:"channel,omitempty"`
	From            string `json:"from,omitempty"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type memoryCandidateFilter struct {
	Status  string
	Target  string
	Channel string
	Limit   int
}

type memoryReflectRequest struct {
	Channel string
	MySlug  string
	Limit   int
}

func (b *Broker) handleMemoryCandidates(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		limit := memoryCandidateDefaultLimit
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil {
				limit = parsed
			}
		}
		candidates := b.ListMemoryCandidates(memoryCandidateFilter{
			Status:  r.URL.Query().Get("status"),
			Target:  r.URL.Query().Get("target"),
			Channel: r.URL.Query().Get("channel"),
			Limit:   limit,
		})
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"candidates": candidates})
	case http.MethodDelete:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			var body struct {
				ID string `json:"id"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			id = strings.TrimSpace(body.ID)
		}
		if id == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		candidate, err := b.MarkMemoryCandidateIgnored(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "candidate": candidate})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (b *Broker) handleMemoryCandidatesReflect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Channel string `json:"channel"`
		MySlug  string `json:"my_slug"`
		Limit   int    `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	candidates, err := b.ReflectMemoryCandidates(memoryReflectRequest{
		Channel: body.Channel,
		MySlug:  body.MySlug,
		Limit:   body.Limit,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"candidates": candidates})
}

func (b *Broker) ReflectMemoryCandidates(req memoryReflectRequest) ([]memoryCandidate, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = memoryCandidateDefaultLimit
	}
	if limit > memoryCandidateMaxLimit {
		limit = memoryCandidateMaxLimit
	}
	channel := normalizeChannelSlug(req.Channel)
	mySlug := normalizeActorSlug(req.MySlug)

	b.mu.Lock()
	changed := b.pruneMemoryCandidatesLocked(time.Now())
	start := len(b.messages) - (limit * 4)
	if start < 0 {
		start = 0
	}
	for _, msg := range b.messages[start:] {
		if channel != "" && normalizeChannelSlug(msg.Channel) != channel {
			continue
		}
		if mySlug != "" {
			from := normalizeActorSlug(msg.From)
			if from != mySlug && from != "human" && from != "you" {
				continue
			}
		}
		if b.captureMemoryCandidateFromMessageLocked(msg) {
			changed = true
		}
	}
	if changed {
		if err := b.saveLocked(); err != nil {
			b.mu.Unlock()
			return nil, err
		}
	}
	candidates := b.listMemoryCandidatesLocked(memoryCandidateFilter{
		Status:  memoryCandidateStatusPending,
		Channel: channel,
		Limit:   limit,
	})
	b.mu.Unlock()
	return candidates, nil
}

func (b *Broker) ListMemoryCandidates(filter memoryCandidateFilter) []memoryCandidate {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.listMemoryCandidatesLocked(filter)
}

func (b *Broker) listMemoryCandidatesLocked(filter memoryCandidateFilter) []memoryCandidate {
	status := normalizeMemoryCandidateStatus(filter.Status)
	if status == "" {
		status = memoryCandidateStatusPending
	}
	target := strings.TrimSpace(filter.Target)
	channel := normalizeChannelSlug(filter.Channel)
	limit := filter.Limit
	if limit <= 0 {
		limit = memoryCandidateDefaultLimit
	}
	if limit > memoryCandidateMaxLimit {
		limit = memoryCandidateMaxLimit
	}

	out := make([]memoryCandidate, 0, limit)
	for _, candidate := range b.memoryCandidates {
		if status != "all" && candidate.Status != status {
			continue
		}
		if target != "" && candidate.Target != target {
			continue
		}
		if channel != "" && normalizeChannelSlug(candidate.Channel) != channel {
			continue
		}
		out = append(out, candidate)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt != out[j].UpdatedAt {
			return out[i].UpdatedAt > out[j].UpdatedAt
		}
		return out[i].ID > out[j].ID
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (b *Broker) MarkMemoryCandidateIgnored(id string) (memoryCandidate, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return memoryCandidate{}, fmt.Errorf("id is required")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	b.mu.Lock()
	defer b.mu.Unlock()
	for i := range b.memoryCandidates {
		if b.memoryCandidates[i].ID != id {
			continue
		}
		b.memoryCandidates[i].Status = memoryCandidateStatusIgnored
		b.memoryCandidates[i].UpdatedAt = now
		if err := b.saveLocked(); err != nil {
			return memoryCandidate{}, err
		}
		return b.memoryCandidates[i], nil
	}
	return memoryCandidate{}, fmt.Errorf("memory candidate not found")
}

func (b *Broker) captureMemoryCandidateFromMessageLocked(msg channelMessage) bool {
	changed := b.pruneMemoryCandidatesLocked(time.Now())
	candidate, ok := memoryCandidateFromMessage(msg)
	if !ok {
		return changed
	}
	for _, existing := range b.memoryCandidates {
		if existing.SourceMessageID == candidate.SourceMessageID && existing.Target == candidate.Target {
			return changed
		}
		if memoryCandidateEquivalent(existing, candidate) {
			return changed
		}
	}
	b.memoryCandidates = append(b.memoryCandidates, candidate)
	b.trimMemoryCandidatesLocked()
	return true
}

func (b *Broker) pruneMemoryCandidatesLocked(now time.Time) bool {
	if len(b.memoryCandidates) == 0 {
		return false
	}
	if now.IsZero() {
		now = time.Now()
	}
	next := b.memoryCandidates[:0]
	changed := false
	for _, candidate := range b.memoryCandidates {
		age := now.Sub(memoryCandidateUpdatedAt(candidate))
		switch candidate.Status {
		case memoryCandidateStatusIgnored:
			if age > memoryCandidateIgnoredTTL {
				changed = true
				continue
			}
		case memoryCandidateStatusPending:
			if age > memoryCandidatePendingTTL {
				changed = true
				continue
			}
		}
		next = append(next, candidate)
	}
	if changed {
		b.memoryCandidates = append([]memoryCandidate(nil), next...)
	}
	return changed
}

func (b *Broker) trimMemoryCandidatesLocked() {
	if len(b.memoryCandidates) <= memoryCandidateMaxStored {
		return
	}
	sort.SliceStable(b.memoryCandidates, func(i, j int) bool {
		if b.memoryCandidates[i].Status != b.memoryCandidates[j].Status {
			return b.memoryCandidates[i].Status == memoryCandidateStatusPending
		}
		return b.memoryCandidates[i].UpdatedAt > b.memoryCandidates[j].UpdatedAt
	})
	b.memoryCandidates = append([]memoryCandidate(nil), b.memoryCandidates[:memoryCandidateMaxStored]...)
}

func memoryCandidateFromMessage(msg channelMessage) (memoryCandidate, bool) {
	messageID := strings.TrimSpace(msg.ID)
	content := strings.TrimSpace(strings.Join([]string{msg.Title, msg.Content}, "\n"))
	if messageID == "" || len([]rune(content)) < 12 {
		return memoryCandidate{}, false
	}
	if strings.TrimSpace(msg.Kind) == homeSummaryMessageKind {
		return memoryCandidate{}, false
	}
	from := normalizeActorSlug(msg.From)
	if from == "" || from == "system" || from == "automation" {
		return memoryCandidate{}, false
	}
	if containsSensitiveMemoryCandidateText(content) {
		return memoryCandidate{}, false
	}

	target, reason := classifyMemoryCandidateTarget(from, content)
	if target == "" {
		return memoryCandidate{}, false
	}
	now := strings.TrimSpace(msg.Timestamp)
	if now == "" {
		now = time.Now().UTC().Format(time.RFC3339)
	}
	threadID := strings.TrimSpace(msg.ReplyTo)
	if threadID == "" {
		threadID = messageID
	}
	content = truncateRunes(strings.Join(strings.Fields(content), " "), memoryCandidateMaxRunes)
	return memoryCandidate{
		ID:              "memory-candidate-" + messageID + "-" + slugify(target),
		Status:          memoryCandidateStatusPending,
		Target:          target,
		Reason:          reason,
		Content:         content,
		Fingerprint:     memoryCandidateFingerprint(target, content),
		SourceMessageID: messageID,
		ThreadID:        threadID,
		Channel:         normalizeChannelSlug(msg.Channel),
		From:            from,
		CreatedAt:       now,
		UpdatedAt:       now,
	}, true
}

func classifyMemoryCandidateTarget(from string, content string) (string, string) {
	text := normalizeMemorySearchText(content)
	isHuman := from == "human" || from == "you"
	switch {
	case isHuman && containsAnyNormalizedPhrase(text,
		"i prefer", "my preference", "please always", "please never", "from now on",
		"선호", "취향", "앞으로", "항상", "절대", "말투",
	):
		return "core:user_profile", "human preference/profile"
	case containsAnyNormalizedPhrase(text,
		"we decided", "decided", "decision", "final decision", "approved", "canonical", "source of truth", "locked in",
		"결정", "확정", "합의", "승인",
	):
		return "core:team_memory", "durable team decision"
	case containsAnyNormalizedPhrase(text,
		"playbook", "runbook", "checklist", "standard operating procedure", "sop", "repeatable workflow",
		"플레이북", "런북", "체크리스트", "반복 작업", "반복 워크플로",
	):
		return "notebook", "repeatable workflow"
	case containsAnyNormalizedPhrase(text,
		"handoff", "handover", "owner", "deadline", "due date", "eta", "next step",
		"담당", "오너", "마감", "다음 단계",
	):
		return "shared", "handoff/ownership"
	case !isHuman && containsAnyNormalizedPhrase(text,
		"lesson learned", "learned", "gotcha", "caveat", "remember next time",
		"주의", "배운 점", "다음부터",
	):
		return "private:" + from, "agent working lesson"
	default:
		return "", ""
	}
}

func containsAnyNormalizedPhrase(text string, phrases ...string) bool {
	for _, phrase := range phrases {
		normalized := normalizeMemorySearchText(phrase)
		if normalized != "" && strings.Contains(text, normalized) {
			return true
		}
	}
	return false
}

func containsSensitiveMemoryCandidateText(content string) bool {
	lower := strings.ToLower(content)
	for _, pattern := range []string{
		"password", "passcode", "api key", "api_key", "secret", "client_secret",
		"authorization: bearer", "private key", "access token", "refresh token",
	} {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

func memoryCandidateEquivalent(a, b memoryCandidate) bool {
	if strings.TrimSpace(a.Target) == "" || strings.TrimSpace(a.Target) != strings.TrimSpace(b.Target) {
		return false
	}
	aFingerprint := strings.TrimSpace(a.Fingerprint)
	if aFingerprint == "" {
		aFingerprint = memoryCandidateFingerprint(a.Target, a.Content)
	}
	bFingerprint := strings.TrimSpace(b.Fingerprint)
	if bFingerprint == "" {
		bFingerprint = memoryCandidateFingerprint(b.Target, b.Content)
	}
	return aFingerprint != "" && aFingerprint == bFingerprint
}

func memoryCandidateFingerprint(target, content string) string {
	target = strings.TrimSpace(target)
	normalized := normalizeMemorySearchText(content)
	if target == "" || normalized == "" {
		return ""
	}
	for _, prefix := range []string{
		"we decided", "decided", "decision", "final decision", "approved", "canonical",
		"i prefer", "my preference", "please always", "please never", "from now on",
		"playbook", "runbook", "checklist", "handoff", "handover",
	} {
		normalized = strings.TrimSpace(strings.ReplaceAll(normalized, normalizeMemorySearchText(prefix), " "))
	}
	seen := map[string]struct{}{}
	tokens := make([]string, 0, 16)
	for _, token := range strings.Fields(normalized) {
		if len([]rune(token)) < 2 {
			continue
		}
		if _, ok := seen[token]; ok {
			continue
		}
		seen[token] = struct{}{}
		tokens = append(tokens, token)
	}
	if len(tokens) == 0 {
		return ""
	}
	sort.Strings(tokens)
	if len(tokens) > 24 {
		tokens = tokens[:24]
	}
	return target + ":" + strings.Join(tokens, " ")
}

func memoryCandidateUpdatedAt(candidate memoryCandidate) time.Time {
	for _, raw := range []string{candidate.UpdatedAt, candidate.CreatedAt} {
		if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(raw)); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func truncateRunes(value string, limit int) string {
	value = strings.TrimSpace(value)
	if limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return strings.TrimSpace(string(runes[:limit])) + "..."
}

func normalizeMemoryCandidateStatus(status string) string {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case "", memoryCandidateStatusPending:
		return memoryCandidateStatusPending
	case memoryCandidateStatusIgnored:
		return memoryCandidateStatusIgnored
	case "all":
		return "all"
	default:
		return ""
	}
}
