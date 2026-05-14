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
	switch strings.TrimSpace(raw) {
	case "laf_model", "local_cli", "record_only":
		return strings.TrimSpace(raw)
	default:
		return "record_only"
	}
}

func (b *Broker) handleOrchestrationConfirm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Intent orchestrationIntent `json:"intent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Intent.ID) == "" || len(body.Intent.ProposedActions) == 0 {
		http.Error(w, "intent with proposed_actions required", http.StatusBadRequest)
		return
	}
	for _, permission := range body.Intent.RequiredPermissions {
		b.mu.Lock()
		missing := b.denyIfMissingPermissionLocked(w, r, permission)
		b.mu.Unlock()
		if missing {
			return
		}
	}
	applied := make([]any, 0, len(body.Intent.ProposedActions))
	for _, action := range body.Intent.ProposedActions {
		result, ok := b.applyOrchestrationAction(r, action)
		if !ok {
			http.Error(w, "unsupported orchestration action", http.StatusBadRequest)
			return
		}
		applied = append(applied, result)
	}
	b.mu.Lock()
	b.appendAuditEventLocked("human", "orchestration.confirmed", "intent", body.Intent.ID, map[string]any{"type": body.Intent.Type})
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"confirmation_id": "confirmation-" + generateToken(),
		"intent_id":       body.Intent.ID,
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
