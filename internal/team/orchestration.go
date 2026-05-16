package team

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"time"
)

type orchestrationIntent struct {
	ID                   string           `json:"id"`
	Type                 string           `json:"type"`
	Risk                 string           `json:"risk"`
	Summary              string           `json:"summary"`
	ProposedActions      []map[string]any `json:"proposed_actions"`
	RequiredPermissions  []string         `json:"required_permissions"`
	Status               string           `json:"status"`
	RequiresConfirmation bool             `json:"requires_confirmation"`
	CreatedAt            string           `json:"created_at"`
	ConfirmedAt          string           `json:"confirmed_at,omitempty"`
	ConfirmationID       string           `json:"confirmation_id,omitempty"`
}

var (
	projectIntentPattern = regexp.MustCompile(`(?i)(?:create|new|make|add)\s+(?:a\s+)?project\s+["']?([^"'\n]+)["']?`)
	taskIntentPattern    = regexp.MustCompile(`(?i)(?:create|new|make|add)\s+(?:a\s+)?(?:task|work item)\s+["']?([^"'\n]+)["']?`)
)

func (b *Broker) handleOrchestrationIntent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Message   string `json:"message"`
		ProjectID string `json:"project_id"`
		ModelMode string `json:"model_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	message := strings.TrimSpace(body.Message)
	if message == "" {
		http.Error(w, "message required", http.StatusBadRequest)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	intent := orchestrationIntent{
		ID:        "intent-" + generateToken(),
		Type:      "chat",
		Risk:      "low",
		Summary:   "Route as normal home chat",
		Status:    "routed",
		CreatedAt: now,
	}
	lower := strings.ToLower(message)
	if match := projectIntentPattern.FindStringSubmatch(message); len(match) > 1 || (strings.Contains(message, "프로젝트") && (strings.Contains(message, "만들") || strings.Contains(message, "생성") || strings.Contains(message, "추가"))) {
		name := strings.TrimSpace(firstRegexGroup(match, message))
		if name == "" {
			name = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(message, "프로젝트"), "새"))
		}
		if name == "" {
			name = "New Project"
		}
		b.mu.Lock()
		code := b.suggestProjectCodeLocked(name, "")
		b.mu.Unlock()
		intent.Type = "project.create"
		intent.Risk = "medium"
		intent.Summary = "Create project: " + name
		intent.RequiredPermissions = []string{permissionProjectCreate}
		intent.RequiresConfirmation = true
		intent.Status = "pending"
		intent.ProposedActions = []map[string]any{{
			"method": "POST",
			"path":   "/projects",
			"body": map[string]any{
				"action":     "create",
				"code":       code,
				"name":       name,
				"created_by": "human",
			},
		}}
	} else if match := taskIntentPattern.FindStringSubmatch(message); len(match) > 1 || ((strings.Contains(lower, "task") || strings.Contains(message, "태스크") || strings.Contains(message, "업무") || strings.Contains(message, "작업")) && (strings.Contains(lower, "create") || strings.Contains(lower, "add") || strings.Contains(message, "만들") || strings.Contains(message, "생성") || strings.Contains(message, "추가"))) {
		title := strings.TrimSpace(firstRegexGroup(match, message))
		if title == "" {
			title = message
		}
		intent.Type = "task.create"
		intent.Risk = "medium"
		intent.Summary = "Create task: " + title
		intent.RequiredPermissions = []string{permissionTaskCreate}
		intent.RequiresConfirmation = true
		intent.Status = "pending"
		actionBody := map[string]any{
			"action":     "create",
			"title":      title,
			"created_by": "human",
			"model_mode": normalizeModelMode(body.ModelMode),
		}
		if projectID := normalizeProjectID(body.ProjectID); projectID != "" {
			actionBody["project_id"] = projectID
		}
		intent.ProposedActions = []map[string]any{{
			"method": "POST",
			"path":   "/tasks",
			"body":   actionBody,
		}}
	}
	b.mu.Lock()
	if user, _, _, ok := b.currentAuthUserLocked(r); ok && user != nil {
		for _, permission := range intent.RequiredPermissions {
			if !authUserHasPermission(user, permission) {
				b.mu.Unlock()
				http.Error(w, "permission required: "+permission, http.StatusForbidden)
				return
			}
		}
	}
	b.appendAuditEventLocked("human", "orchestration.intent", "intent", intent.ID, map[string]any{"type": intent.Type})
	if intent.RequiresConfirmation {
		b.orchestrationIntents = append(b.orchestrationIntents, intent)
		if err := b.saveLocked(); err != nil {
			b.mu.Unlock()
			http.Error(w, "failed to persist orchestration intent", http.StatusInternalServerError)
			return
		}
	}
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"intent": intent})
}

func firstRegexGroup(match []string, fallback string) string {
	if len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return strings.TrimSpace(fallback)
}

func normalizeModelMode(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "local_cli" {
		return "my_bridge"
	}
	switch value {
	case "laf_model", "my_bridge", "team_bridge", "record_only":
		return value
	default:
		return "record_only"
	}
}

func normalizeRunnerJobModelMode(raw string) string {
	if strings.TrimSpace(raw) == "local_cli" {
		return "team_bridge"
	}
	return normalizeModelMode(raw)
}

func (b *Broker) handleOrchestrationConfirm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		IntentID string `json:"intent_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	intentID := strings.TrimSpace(body.IntentID)
	if intentID == "" {
		http.Error(w, "intent_id required", http.StatusBadRequest)
		return
	}
	b.mu.Lock()
	intentIndex := -1
	var intent orchestrationIntent
	for i := range b.orchestrationIntents {
		if b.orchestrationIntents[i].ID == intentID {
			intentIndex = i
			intent = b.orchestrationIntents[i]
			break
		}
	}
	if intentIndex < 0 {
		b.mu.Unlock()
		http.Error(w, "orchestration intent not found", http.StatusNotFound)
		return
	}
	if intent.Status != "pending" {
		b.mu.Unlock()
		http.Error(w, "orchestration intent is "+intent.Status, http.StatusConflict)
		return
	}
	if len(intent.ProposedActions) == 0 {
		b.mu.Unlock()
		http.Error(w, "orchestration intent has no proposed actions", http.StatusBadRequest)
		return
	}
	for _, permission := range intent.RequiredPermissions {
		if !b.requestUserHasPermissionLocked(r, permission) {
			b.mu.Unlock()
			http.Error(w, "permission required: "+permission, http.StatusForbidden)
			return
		}
	}
	b.mu.Unlock()
	applied := make([]any, 0, len(intent.ProposedActions))
	for _, action := range intent.ProposedActions {
		result, ok := b.applyOrchestrationAction(r, action)
		if !ok {
			http.Error(w, "unsupported orchestration action", http.StatusBadRequest)
			return
		}
		applied = append(applied, result)
	}
	confirmationID := "confirmation-" + generateToken()
	confirmedAt := time.Now().UTC().Format(time.RFC3339)
	b.mu.Lock()
	for i := range b.orchestrationIntents {
		if b.orchestrationIntents[i].ID == intentID {
			b.orchestrationIntents[i].Status = "applied"
			b.orchestrationIntents[i].ConfirmedAt = confirmedAt
			b.orchestrationIntents[i].ConfirmationID = confirmationID
			break
		}
	}
	b.appendAuditEventLocked("human", "orchestration.confirmed", "intent", intent.ID, map[string]any{"type": intent.Type})
	if err := b.saveLocked(); err != nil {
		b.mu.Unlock()
		http.Error(w, "failed to persist orchestration confirmation", http.StatusInternalServerError)
		return
	}
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"confirmation_id": confirmationID,
		"intent_id":       intent.ID,
		"applied":         applied,
		"status":          "applied",
	})
}

func (b *Broker) applyOrchestrationAction(source *http.Request, action map[string]any) (map[string]any, bool) {
	method, _ := action["method"].(string)
	path, _ := action["path"].(string)
	body, _ := action["body"].(map[string]any)
	if strings.ToUpper(strings.TrimSpace(method)) != http.MethodPost || (path != "/projects" && path != "/tasks") {
		return nil, false
	}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	for _, cookie := range source.Cookies() {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	switch path {
	case "/projects":
		b.handlePostProject(rec, req)
	case "/tasks":
		b.handlePostTask(rec, req)
	default:
		return nil, false
	}
	if rec.Code < 200 || rec.Code >= 300 {
		return map[string]any{"path": path, "status": rec.Code, "error": strings.TrimSpace(rec.Body.String())}, true
	}
	var decoded map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&decoded); err != nil {
		return map[string]any{"path": path, "status": rec.Code}, true
	}
	decoded["path"] = path
	decoded["status"] = rec.Code
	return decoded, true
}
