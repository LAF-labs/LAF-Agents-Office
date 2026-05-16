package team

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	sessionSearchDefaultLimit = 10
	sessionSearchMaxLimit     = 30
	sessionSearchSnippetRunes = 260
)

type sessionArchiveEntry struct {
	ID         string   `json:"id"`
	Source     string   `json:"source"`
	ThreadID   string   `json:"thread_id,omitempty"`
	MessageID  string   `json:"message_id"`
	Channel    string   `json:"channel,omitempty"`
	From       string   `json:"from,omitempty"`
	Kind       string   `json:"kind,omitempty"`
	Title      string   `json:"title,omitempty"`
	Content    string   `json:"content"`
	Tagged     []string `json:"tagged,omitempty"`
	ProjectID  string   `json:"project_id,omitempty"`
	TaskID     string   `json:"task_id,omitempty"`
	Scope      string   `json:"scope,omitempty"`
	Timestamp  string   `json:"timestamp,omitempty"`
	ArchivedAt string   `json:"archived_at"`
}

type sessionSearchHit struct {
	Source    string  `json:"source"`
	Score     int     `json:"score"`
	ThreadID  string  `json:"thread_id,omitempty"`
	MessageID string  `json:"message_id"`
	Channel   string  `json:"channel,omitempty"`
	From      string  `json:"from,omitempty"`
	Kind      string  `json:"kind,omitempty"`
	Title     string  `json:"title,omitempty"`
	Snippet   string  `json:"snippet"`
	ProjectID string  `json:"project_id,omitempty"`
	TaskID    string  `json:"task_id,omitempty"`
	Timestamp string  `json:"timestamp,omitempty"`
	Archived  bool    `json:"archived,omitempty"`
	RankHint  float64 `json:"rank_hint,omitempty"`
}

type sessionSearchRequest struct {
	Query string
	Limit int
	Scope string
}

type sessionSearchQuery struct {
	Raw        string
	Normalized string
	Tokens     []string
}

func (b *Broker) handleSessionSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	limit := sessionSearchDefaultLimit
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	hits, err := b.SearchSessions(sessionSearchRequest{
		Query: r.URL.Query().Get("q"),
		Limit: limit,
		Scope: r.URL.Query().Get("scope"),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"hits": hits})
}

func (b *Broker) archiveSessionMessagesLocked(threadID string, messages []channelMessage, archivedAt string, source string) {
	threadID = strings.TrimSpace(threadID)
	if len(messages) == 0 {
		return
	}
	if archivedAt = strings.TrimSpace(archivedAt); archivedAt == "" {
		archivedAt = time.Now().UTC().Format(time.RFC3339)
	}
	source = strings.TrimSpace(source)
	if source == "" {
		source = "archive"
	}
	existing := make(map[string]struct{}, len(b.sessionArchive))
	for _, entry := range b.sessionArchive {
		existing[entry.Source+":"+entry.MessageID] = struct{}{}
	}
	for _, msg := range messages {
		messageID := strings.TrimSpace(msg.ID)
		if messageID == "" || strings.TrimSpace(msg.Content) == "" {
			continue
		}
		key := source + ":" + messageID
		if _, ok := existing[key]; ok {
			continue
		}
		entry := sessionArchiveEntry{
			ID:         "session-archive-" + source + "-" + messageID,
			Source:     source,
			ThreadID:   threadID,
			MessageID:  messageID,
			Channel:    normalizeChannelSlug(msg.Channel),
			From:       strings.TrimSpace(msg.From),
			Kind:       strings.TrimSpace(msg.Kind),
			Title:      strings.TrimSpace(msg.Title),
			Content:    strings.TrimSpace(msg.Content),
			Tagged:     append([]string(nil), msg.Tagged...),
			ProjectID:  strings.TrimSpace(msg.ProjectID),
			TaskID:     strings.TrimSpace(msg.TaskID),
			Scope:      strings.TrimSpace(msg.Scope),
			Timestamp:  strings.TrimSpace(msg.Timestamp),
			ArchivedAt: archivedAt,
		}
		b.sessionArchive = append(b.sessionArchive, entry)
		existing[key] = struct{}{}
	}
}

func (b *Broker) SearchSessions(req sessionSearchRequest) ([]sessionSearchHit, error) {
	query := strings.TrimSpace(req.Query)
	if len([]rune(query)) < 2 {
		return nil, fmt.Errorf("q must be at least 2 characters")
	}
	limit := req.Limit
	if limit <= 0 {
		limit = sessionSearchDefaultLimit
	}
	if limit > sessionSearchMaxLimit {
		limit = sessionSearchMaxLimit
	}
	scope := strings.TrimSpace(strings.ToLower(req.Scope))
	switch scope {
	case "", "all", "home", "task", "archived":
	default:
		return nil, fmt.Errorf("unsupported scope %q", req.Scope)
	}

	b.mu.Lock()
	messages := append([]channelMessage(nil), b.messages...)
	archive := append([]sessionArchiveEntry(nil), b.sessionArchive...)
	b.mu.Unlock()

	searchQuery := buildSessionSearchQuery(query)
	hits := make([]sessionSearchHit, 0, limit)
	seen := map[string]struct{}{}
	for _, msg := range messages {
		hit, ok := sessionSearchHitFromMessage(msg, searchQuery, scope)
		if !ok {
			continue
		}
		key := "live:" + hit.MessageID
		seen[key] = struct{}{}
		hits = append(hits, hit)
	}
	for _, entry := range archive {
		hit, ok := sessionSearchHitFromArchive(entry, searchQuery, scope)
		if !ok {
			continue
		}
		if _, exists := seen["live:"+hit.MessageID]; exists {
			continue
		}
		key := "archive:" + hit.MessageID
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		hits = append(hits, hit)
	}
	sort.Slice(hits, func(i, j int) bool {
		if hits[i].Score != hits[j].Score {
			return hits[i].Score > hits[j].Score
		}
		if hits[i].Timestamp != hits[j].Timestamp {
			return hits[i].Timestamp > hits[j].Timestamp
		}
		return hits[i].MessageID < hits[j].MessageID
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits, nil
}

func sessionSearchHitFromMessage(msg channelMessage, query sessionSearchQuery, scope string) (sessionSearchHit, bool) {
	threadID := strings.TrimSpace(msg.ReplyTo)
	if threadID == "" {
		threadID = strings.TrimSpace(msg.ID)
	}
	if !sessionSearchScopeMatches(scope, threadID, msg.TaskID, false) {
		return sessionSearchHit{}, false
	}
	score := scoreSessionSearchFields(query,
		[]string{msg.Title, msg.Content},
		[]string{msg.From, msg.Channel, msg.ProjectID, msg.TaskID},
	)
	if score <= 0 {
		return sessionSearchHit{}, false
	}
	snippetSource := strings.TrimSpace(strings.Join([]string{msg.Title, msg.Content}, " "))
	return sessionSearchHit{
		Source:    "live",
		Score:     score,
		ThreadID:  threadID,
		MessageID: strings.TrimSpace(msg.ID),
		Channel:   strings.TrimSpace(msg.Channel),
		From:      strings.TrimSpace(msg.From),
		Kind:      strings.TrimSpace(msg.Kind),
		Title:     strings.TrimSpace(msg.Title),
		Snippet:   sessionSearchSnippet(snippetSource, query.Raw),
		ProjectID: strings.TrimSpace(msg.ProjectID),
		TaskID:    strings.TrimSpace(msg.TaskID),
		Timestamp: strings.TrimSpace(msg.Timestamp),
	}, true
}

func sessionSearchHitFromArchive(entry sessionArchiveEntry, query sessionSearchQuery, scope string) (sessionSearchHit, bool) {
	if !sessionSearchScopeMatches(scope, entry.ThreadID, entry.TaskID, true) {
		return sessionSearchHit{}, false
	}
	score := scoreSessionSearchFields(query,
		[]string{entry.Title, entry.Content},
		[]string{entry.From, entry.Channel, entry.ProjectID, entry.TaskID},
	)
	if score <= 0 {
		return sessionSearchHit{}, false
	}
	snippetSource := strings.TrimSpace(strings.Join([]string{entry.Title, entry.Content}, " "))
	return sessionSearchHit{
		Source:    entry.Source,
		Score:     score,
		ThreadID:  strings.TrimSpace(entry.ThreadID),
		MessageID: strings.TrimSpace(entry.MessageID),
		Channel:   strings.TrimSpace(entry.Channel),
		From:      strings.TrimSpace(entry.From),
		Kind:      strings.TrimSpace(entry.Kind),
		Title:     strings.TrimSpace(entry.Title),
		Snippet:   sessionSearchSnippet(snippetSource, query.Raw),
		ProjectID: strings.TrimSpace(entry.ProjectID),
		TaskID:    strings.TrimSpace(entry.TaskID),
		Timestamp: strings.TrimSpace(entry.Timestamp),
		Archived:  true,
	}, true
}

func sessionSearchScopeMatches(scope, threadID, taskID string, archived bool) bool {
	switch scope {
	case "", "all":
		return true
	case "home":
		return isHomeThreadID(threadID)
	case "task":
		return strings.TrimSpace(taskID) != "" || strings.HasPrefix(strings.TrimSpace(threadID), "task-")
	case "archived":
		return archived
	default:
		return true
	}
}

func scoreSessionSearchText(text string, query string) int {
	return scoreSessionSearchFields(buildSessionSearchQuery(query), []string{text}, nil)
}

func buildSessionSearchQuery(raw string) sessionSearchQuery {
	normalized := normalizeSessionSearchText(raw)
	tokens := make([]string, 0, len(strings.Fields(normalized)))
	seen := map[string]struct{}{}
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
	return sessionSearchQuery{
		Raw:        strings.TrimSpace(raw),
		Normalized: normalized,
		Tokens:     tokens,
	}
}

func scoreSessionSearchFields(query sessionSearchQuery, primaryFields []string, metadataFields []string) int {
	if query.Normalized == "" {
		return 0
	}
	primaryText := normalizeSessionSearchText(strings.Join(primaryFields, "\n"))
	metadataText := normalizeSessionSearchText(strings.Join(metadataFields, "\n"))
	if primaryText == "" && metadataText == "" {
		return 0
	}

	score := 0
	matchedTokens := map[string]struct{}{}
	exactPrimary := primaryText != "" && strings.Contains(primaryText, query.Normalized)
	exactMetadata := metadataText != "" && strings.Contains(metadataText, query.Normalized)
	if exactPrimary {
		score += 180
	} else if exactMetadata {
		score += 40
	}
	for _, token := range query.Tokens {
		if primaryText != "" && strings.Contains(primaryText, token) {
			score += 16
			matchedTokens[token] = struct{}{}
		}
		if metadataText != "" && strings.Contains(metadataText, token) {
			score += 4
			matchedTokens[token] = struct{}{}
		}
	}
	if len(query.Tokens) > 1 {
		required := 2
		if len(query.Tokens) < required {
			required = len(query.Tokens)
		}
		if !exactPrimary && !exactMetadata && len(matchedTokens) < required {
			return 0
		}
		if len(matchedTokens) == len(query.Tokens) {
			score += 45
		}
	}
	return score
}

func normalizeSessionSearchText(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}
	var b strings.Builder
	lastSpace := false
	for _, r := range value {
		switch {
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			b.WriteRune(r)
			lastSpace = false
		default:
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
		}
	}
	return strings.TrimSpace(b.String())
}

func sessionSearchSnippet(content string, query string) string {
	content = strings.TrimSpace(strings.ReplaceAll(content, "\n", " "))
	if content == "" {
		return ""
	}
	lower := strings.ToLower(content)
	start := 0
	for _, token := range strings.Fields(strings.ToLower(query)) {
		if idx := strings.Index(lower, token); idx >= 0 {
			start = utf8.RuneCountInString(lower[:idx]) - 80
			if start < 0 {
				start = 0
			}
			break
		}
	}
	runes := []rune(content)
	if start > len(runes) {
		start = 0
	}
	end := start + sessionSearchSnippetRunes
	if end > len(runes) {
		end = len(runes)
	}
	snippet := strings.TrimSpace(string(runes[start:end]))
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(runes) {
		snippet += "..."
	}
	return snippet
}
