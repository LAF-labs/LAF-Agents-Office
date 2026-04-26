package team

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestProjectsAPIAndTaskFiltering(t *testing.T) {
	b := newTestBroker(t)

	projectA := createProjectForTest(t, b, map[string]string{
		"name":       "Customer Portal",
		"created_by": "human",
	})
	projectB := createProjectForTest(t, b, map[string]string{
		"id":         "agent-lab",
		"name":       "Agent Lab",
		"created_by": "human",
	})
	if projectA.ID != "customer-portal" {
		t.Fatalf("project id = %q, want customer-portal", projectA.ID)
	}

	createTaskForProjectTest(t, b, "Portal board", projectA.ID)
	createTaskForProjectTest(t, b, "Portal oauth", projectA.ID)
	createTaskForProjectTest(t, b, "Agent sandbox", projectB.ID)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/tasks?all_channels=true&include_done=true&project_id="+projectA.ID, nil)
	b.handleGetTasks(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get project tasks status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var taskBody struct {
		Tasks []teamTask `json:"tasks"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&taskBody); err != nil {
		t.Fatalf("decode tasks: %v", err)
	}
	if len(taskBody.Tasks) != 2 {
		t.Fatalf("project tasks len = %d, want 2: %+v", len(taskBody.Tasks), taskBody.Tasks)
	}
	for _, task := range taskBody.Tasks {
		if task.ProjectID != projectA.ID {
			t.Fatalf("task %s project_id = %q, want %q", task.ID, task.ProjectID, projectA.ID)
		}
	}

	badTask := httptest.NewRecorder()
	b.handlePostTask(badTask, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "create",
		"title":      "Ghost project task",
		"created_by": "human",
		"project_id": "missing-project",
	}))
	if badTask.Code != http.StatusNotFound {
		t.Fatalf("missing project task status = %d, want %d", badTask.Code, http.StatusNotFound)
	}
}

func TestProjectStatePersistsWithTasks(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "broker-state.json")
	b := NewBrokerAt(statePath)
	project := createProjectForTest(t, b, map[string]string{
		"name":       "Launch Room",
		"created_by": "human",
	})
	task := createTaskForProjectTest(t, b, "Invite first teammate", project.ID)

	loaded := NewBrokerAt(statePath)
	if err := loaded.loadState(); err != nil {
		t.Fatalf("load state: %v", err)
	}
	projectsRec := httptest.NewRecorder()
	loaded.handleProjects(projectsRec, httptest.NewRequest(http.MethodGet, "/projects", nil))
	if projectsRec.Code != http.StatusOK {
		t.Fatalf("get projects status = %d, want %d: %s", projectsRec.Code, http.StatusOK, projectsRec.Body.String())
	}
	var projectsBody struct {
		Projects []teamProject `json:"projects"`
	}
	if err := json.NewDecoder(projectsRec.Body).Decode(&projectsBody); err != nil {
		t.Fatalf("decode projects: %v", err)
	}
	if len(projectsBody.Projects) != 1 || projectsBody.Projects[0].ID != project.ID {
		t.Fatalf("loaded projects = %+v, want %q", projectsBody.Projects, project.ID)
	}

	tasksRec := httptest.NewRecorder()
	loaded.handleGetTasks(tasksRec, httptest.NewRequest(http.MethodGet, "/tasks?all_channels=true&include_done=true&project_id="+project.ID, nil))
	if tasksRec.Code != http.StatusOK {
		t.Fatalf("get tasks status = %d, want %d: %s", tasksRec.Code, http.StatusOK, tasksRec.Body.String())
	}
	var tasksBody struct {
		Tasks []teamTask `json:"tasks"`
	}
	if err := json.NewDecoder(tasksRec.Body).Decode(&tasksBody); err != nil {
		t.Fatalf("decode tasks: %v", err)
	}
	if len(tasksBody.Tasks) != 1 || tasksBody.Tasks[0].ID != task.ID || tasksBody.Tasks[0].ProjectID != project.ID {
		t.Fatalf("loaded tasks = %+v, want task %q in project %q", tasksBody.Tasks, task.ID, project.ID)
	}
}

func createProjectForTest(t *testing.T, b *Broker, body map[string]string) teamProject {
	t.Helper()
	rec := httptest.NewRecorder()
	b.handleProjects(rec, jsonRequestForTest(t, "/projects", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("create project status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var response struct {
		Project teamProject `json:"project"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	return response.Project
}

func createTaskForProjectTest(t *testing.T, b *Broker, title, projectID string) teamTask {
	t.Helper()
	rec := httptest.NewRecorder()
	b.handlePostTask(rec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "create",
		"title":      title,
		"created_by": "human",
		"project_id": projectID,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("create task status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var response struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode task: %v", err)
	}
	return response.Task
}

func jsonRequestForTest(t *testing.T, path string, body any) *http.Request {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	return req
}
