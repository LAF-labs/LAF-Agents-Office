package team

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOrchestrationConfirmRequiresStoredIntentID(t *testing.T) {
	b := newTestBroker(t)
	owner := signupForTest(t, b, "owner@example.com", "Owner", "create", "Bridge Team", "")

	intentReq := jsonRequestForTest(t, "/orchestration/intent", map[string]string{
		"message": "create project Alpha",
	})
	intentReq.AddCookie(owner.Cookie)
	intentRec := httptest.NewRecorder()
	b.handleOrchestrationIntent(intentRec, intentReq)
	if intentRec.Code != http.StatusOK {
		t.Fatalf("intent status=%d body=%s", intentRec.Code, intentRec.Body.String())
	}
	var intentBody struct {
		Intent orchestrationIntent `json:"intent"`
	}
	if err := json.NewDecoder(intentRec.Body).Decode(&intentBody); err != nil {
		t.Fatalf("decode intent: %v", err)
	}

	forgedReq := jsonRequestForTest(t, "/orchestration/confirm", map[string]any{
		"intent": map[string]any{
			"id": intentBody.Intent.ID,
			"proposed_actions": []map[string]any{{
				"method": "POST",
				"path":   "/projects",
				"body": map[string]any{
					"action": "create",
					"name":   "Forged Project",
				},
			}},
		},
	})
	forgedReq.AddCookie(owner.Cookie)
	forgedRec := httptest.NewRecorder()
	b.handleOrchestrationConfirm(forgedRec, forgedReq)
	if forgedRec.Code != http.StatusBadRequest {
		t.Fatalf("forged confirm status=%d body=%s", forgedRec.Code, forgedRec.Body.String())
	}
	if !strings.Contains(forgedRec.Body.String(), "intent_id required") {
		t.Fatalf("forged confirm body=%q", forgedRec.Body.String())
	}
	if len(b.projects) != 0 {
		t.Fatalf("forged confirm created projects: %+v", b.projects)
	}

	confirmReq := jsonRequestForTest(t, "/orchestration/confirm", map[string]string{
		"intent_id": intentBody.Intent.ID,
	})
	confirmReq.AddCookie(owner.Cookie)
	confirmRec := httptest.NewRecorder()
	b.handleOrchestrationConfirm(confirmRec, confirmReq)
	if confirmRec.Code != http.StatusOK {
		t.Fatalf("confirm status=%d body=%s", confirmRec.Code, confirmRec.Body.String())
	}
	if len(b.projects) != 1 || b.projects[0].Name != "Alpha" {
		t.Fatalf("stored confirm projects=%+v", b.projects)
	}
	if len(b.orchestrationIntents) != 1 || b.orchestrationIntents[0].Status != "applied" {
		t.Fatalf("intent state=%+v", b.orchestrationIntents)
	}
}

func TestSkillInvokeRequiresInvokeAndManifestPermissions(t *testing.T) {
	b := newTestBroker(t)
	user := signupForTest(t, b, "viewer@example.com", "Viewer", "create", "Skill Team", "")
	b.mu.Lock()
	for i := range b.authUsers {
		if b.authUsers[i].ID == user.User.ID {
			b.authUsers[i].Role = "viewer"
		}
	}
	b.skills = append(b.skills, teamSkill{
		ID:        "skill-deploy",
		Name:      "deploy",
		Title:     "Deploy",
		Content:   "Deploy safely.",
		CreatedBy: "ceo",
		Status:    "active",
	})
	b.mu.Unlock()

	missingInvokeReq := jsonRequestForTest(t, "/skills/deploy/invoke", map[string]string{})
	missingInvokeReq.AddCookie(user.Cookie)
	missingInvokeRec := httptest.NewRecorder()
	b.handleInvokeSkill(missingInvokeRec, missingInvokeReq)
	if missingInvokeRec.Code != http.StatusForbidden {
		raw, _ := io.ReadAll(missingInvokeRec.Result().Body)
		t.Fatalf("missing invoke status=%d body=%s", missingInvokeRec.Code, raw)
	}
	if !strings.Contains(missingInvokeRec.Body.String(), "permission required: "+permissionSkillInvoke) {
		t.Fatalf("missing invoke body=%q", missingInvokeRec.Body.String())
	}

	b.mu.Lock()
	for i := range b.authUsers {
		if b.authUsers[i].ID == user.User.ID {
			b.authUsers[i].Role = "member"
		}
	}
	b.skills[0].RequiredPermissions = []string{permissionRunnerManage}
	b.mu.Unlock()

	missingManifestReq := jsonRequestForTest(t, "/skills/deploy/invoke", map[string]string{})
	missingManifestReq.AddCookie(user.Cookie)
	missingManifestRec := httptest.NewRecorder()
	b.handleInvokeSkill(missingManifestRec, missingManifestReq)
	if missingManifestRec.Code != http.StatusForbidden {
		raw, _ := io.ReadAll(missingManifestRec.Result().Body)
		t.Fatalf("missing manifest status=%d body=%s", missingManifestRec.Code, raw)
	}
	if !strings.Contains(missingManifestRec.Body.String(), "permission required: "+permissionRunnerManage) {
		t.Fatalf("missing manifest body=%q", missingManifestRec.Body.String())
	}
	if b.skills[0].UsageCount != 0 {
		t.Fatalf("usage count changed on denied invoke: %d", b.skills[0].UsageCount)
	}
}

func TestRunnerJobsOnlyQueueForTeamBridge(t *testing.T) {
	base := teamTask{ID: "task-1", Owner: "be", Status: taskStatusInProgress}
	for _, mode := range []string{"", "record_only", "laf_model", "my_bridge", "local_cli"} {
		task := base
		task.ModelMode = mode
		if taskNeedsRunnerJob(task) {
			t.Fatalf("mode %q unexpectedly needs runner job", mode)
		}
	}
	task := base
	task.ModelMode = "team_bridge"
	if !taskNeedsRunnerJob(task) {
		t.Fatalf("team_bridge task should need runner job")
	}
}

func TestWikiReadPermissionIsIssuedForMCPContext(t *testing.T) {
	perms := effectivePermissions("member", permissionOverride{})
	if !containsString(perms, permissionWikiRead) {
		t.Fatalf("member permissions missing %s: %+v", permissionWikiRead, perms)
	}
}
