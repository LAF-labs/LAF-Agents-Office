package team

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProjectsAPIAndTaskFiltering(t *testing.T) {
	b := newTestBroker(t)

	projectA := createProjectForTest(t, b, map[string]string{
		"name":            "Customer Portal",
		"created_by":      "human",
		"github_repo_url": " https://github.com/laf-labs/customer-portal ",
	})
	projectB := createProjectForTest(t, b, map[string]string{
		"id":         "agent-lab",
		"name":       "Agent Lab",
		"created_by": "human",
	})
	if projectA.ID != "customer-portal" {
		t.Fatalf("project id = %q, want customer-portal", projectA.ID)
	}
	if projectA.GitHubRepoURL != "https://github.com/laf-labs/customer-portal" {
		t.Fatalf("project github_repo_url = %q", projectA.GitHubRepoURL)
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
		"name":            "Launch Room",
		"created_by":      "human",
		"github_repo_url": "git@github.com:LAF-labs/launch-room.git",
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
	if projectsBody.Projects[0].GitHubRepoURL != "git@github.com:LAF-labs/launch-room.git" {
		t.Fatalf("loaded project github_repo_url = %q", projectsBody.Projects[0].GitHubRepoURL)
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

func TestProjectGitHubRepoURLCanBeUpdatedAndCleared(t *testing.T) {
	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":            "Repo Setup",
		"created_by":      "human",
		"github_repo_url": "https://github.com/laf-labs/old",
	})

	updateRec := httptest.NewRecorder()
	b.handleProjects(updateRec, jsonRequestForTest(t, "/projects", map[string]string{
		"action":          "update",
		"id":              project.ID,
		"name":            project.Name,
		"description":     project.Description,
		"created_by":      "human",
		"github_repo_url": "https://github.com/laf-labs/new",
	}))
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update project status = %d, want %d: %s", updateRec.Code, http.StatusOK, updateRec.Body.String())
	}
	var updated struct {
		Project teamProject `json:"project"`
	}
	if err := json.NewDecoder(updateRec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated project: %v", err)
	}
	if updated.Project.GitHubRepoURL != "https://github.com/laf-labs/new" {
		t.Fatalf("updated github_repo_url = %q", updated.Project.GitHubRepoURL)
	}

	clearRec := httptest.NewRecorder()
	b.handleProjects(clearRec, jsonRequestForTest(t, "/projects", map[string]string{
		"action":          "update",
		"id":              project.ID,
		"name":            project.Name,
		"created_by":      "human",
		"github_repo_url": "",
	}))
	if clearRec.Code != http.StatusOK {
		t.Fatalf("clear project repo status = %d, want %d: %s", clearRec.Code, http.StatusOK, clearRec.Body.String())
	}
	var cleared struct {
		Project teamProject `json:"project"`
	}
	if err := json.NewDecoder(clearRec.Body).Decode(&cleared); err != nil {
		t.Fatalf("decode cleared project: %v", err)
	}
	if cleared.Project.GitHubRepoURL != "" {
		t.Fatalf("cleared github_repo_url = %q", cleared.Project.GitHubRepoURL)
	}
}

func TestProjectGitHubRepoURLUpdatePreservesOmittedFields(t *testing.T) {
	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":        "Repo Setup",
		"description": "Project memory should survive repo edits.",
		"created_by":  "human",
	})

	updateRec := httptest.NewRecorder()
	b.handleProjects(updateRec, jsonRequestForTest(t, "/projects", map[string]string{
		"action":          "update",
		"id":              project.ID,
		"created_by":      "human",
		"github_repo_url": "https://github.com/laf-labs/repo-setup",
	}))
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update project status = %d, want %d: %s", updateRec.Code, http.StatusOK, updateRec.Body.String())
	}
	var updated struct {
		Project teamProject `json:"project"`
	}
	if err := json.NewDecoder(updateRec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated project: %v", err)
	}
	if updated.Project.Name != project.Name {
		t.Fatalf("updated name = %q, want %q", updated.Project.Name, project.Name)
	}
	if updated.Project.Description != project.Description {
		t.Fatalf("updated description = %q, want %q", updated.Project.Description, project.Description)
	}
	if updated.Project.Status != project.Status {
		t.Fatalf("updated status = %q, want %q", updated.Project.Status, project.Status)
	}
	if updated.Project.GitHubRepoURL != "https://github.com/laf-labs/repo-setup" {
		t.Fatalf("updated github_repo_url = %q", updated.Project.GitHubRepoURL)
	}
}

func TestProjectCreationMaterializesWikiArticle(t *testing.T) {
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
	t.Cleanup(func() {
		cancel()
		worker.Stop()
	})
	b.mu.Lock()
	b.wikiWorker = worker
	b.mu.Unlock()

	project := createProjectForTest(t, b, map[string]string{
		"name":            "Customer Portal",
		"created_by":      "human",
		"github_repo_url": "https://github.com/laf-labs/customer-portal",
	})
	worker.WaitForIdle()

	articlePath := filepath.Join(root, "team", "projects", project.ID+".md")
	raw, err := os.ReadFile(articlePath)
	if err != nil {
		t.Fatalf("read materialized project wiki: %v", err)
	}
	content := string(raw)
	for _, want := range []string{
		"# Customer Portal",
		"Project ID: `customer-portal`",
		"https://github.com/laf-labs/customer-portal",
		"## Agent work",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("project wiki missing %q in:\n%s", want, content)
		}
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/wiki/article?path=team/projects/"+project.ID+".md", nil)
	b.handleWikiArticle(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("wiki article status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestProjectGitHubUpdateSyncsMaterializedWikiArticle(t *testing.T) {
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
	t.Cleanup(func() {
		cancel()
		worker.Stop()
	})
	b.mu.Lock()
	b.wikiWorker = worker
	b.mu.Unlock()

	project := createProjectForTest(t, b, map[string]string{
		"name":       "Agent Lab",
		"created_by": "human",
	})
	worker.WaitForIdle()

	updateRec := httptest.NewRecorder()
	b.handleProjects(updateRec, jsonRequestForTest(t, "/projects", map[string]string{
		"action":          "update",
		"id":              project.ID,
		"created_by":      "human",
		"github_repo_url": "https://github.com/laf-labs/agent-lab",
	}))
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update project status = %d, want %d: %s", updateRec.Code, http.StatusOK, updateRec.Body.String())
	}
	worker.WaitForIdle()

	articlePath := filepath.Join(root, "team", "projects", project.ID+".md")
	raw, err := os.ReadFile(articlePath)
	if err != nil {
		t.Fatalf("read materialized project wiki: %v", err)
	}
	content := string(raw)
	if !strings.Contains(content, "- GitHub repo: https://github.com/laf-labs/agent-lab") {
		t.Fatalf("project wiki did not sync github repo:\n%s", content)
	}
	if strings.Contains(content, "- GitHub repo: _not connected_") {
		t.Fatalf("project wiki still says repo is not connected:\n%s", content)
	}
}

func TestProjectTaskWithoutGitHubRepoDoesNotGetLocalWorktree(t *testing.T) {
	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":       "Agent Lab",
		"created_by": "human",
	})

	rec := httptest.NewRecorder()
	b.handlePostTask(rec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "create",
		"title":      "Implement the signup flow",
		"details":    "Build the code path and tests.",
		"owner":      "eng",
		"created_by": "human",
		"project_id": project.ID,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("create project task status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var created struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatalf("decode task: %v", err)
	}
	if created.Task.ExecutionMode != executionModeOffice {
		t.Fatalf("execution_mode = %q, want %q for project without repo", created.Task.ExecutionMode, executionModeOffice)
	}
	if created.Task.WorktreePath != "" || created.Task.WorktreeBranch != "" {
		t.Fatalf("expected no worktree for project without repo, got path=%q branch=%q", created.Task.WorktreePath, created.Task.WorktreeBranch)
	}
}

func TestProjectTaskWithGitHubRepoKeepsLocalWorktree(t *testing.T) {
	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "https://github.com/laf-labs/agent-lab",
	})

	rec := httptest.NewRecorder()
	b.handlePostTask(rec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "create",
		"title":      "Implement the signup flow",
		"details":    "Build the code path and tests.",
		"owner":      "eng",
		"created_by": "human",
		"project_id": project.ID,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("create project task status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var created struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatalf("decode task: %v", err)
	}
	if created.Task.ExecutionMode != executionModeLocalWorktree {
		t.Fatalf("execution_mode = %q, want %q for project with repo", created.Task.ExecutionMode, executionModeLocalWorktree)
	}
	if created.Task.WorktreePath == "" || created.Task.WorktreeBranch == "" {
		t.Fatalf("expected worktree for project with repo, got path=%q branch=%q", created.Task.WorktreePath, created.Task.WorktreeBranch)
	}
}

func TestProjectTaskWithGitHubRepoUsesProjectRepoWorktree(t *testing.T) {
	oldProjectPrepare := prepareProjectTaskWorktree
	oldPrepare := prepareTaskWorktree
	t.Cleanup(func() {
		prepareProjectTaskWorktree = oldProjectPrepare
		prepareTaskWorktree = oldPrepare
	})

	var gotProjectID, gotRepoURL, gotTaskID string
	prepareProjectTaskWorktree = func(projectID, repoURL, taskID string) (string, string, error) {
		gotProjectID = projectID
		gotRepoURL = repoURL
		gotTaskID = taskID
		return "/tmp/laf-office-task-project-task", "laf-office-project-task", nil
	}
	prepareTaskWorktree = func(taskID string) (string, string, error) {
		t.Fatalf("unexpected default LAF-Office worktree for project task %s", taskID)
		return "", "", nil
	}

	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "git@github.com:LAF-labs/agent-lab.git",
	})

	rec := httptest.NewRecorder()
	b.handlePostTask(rec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "create",
		"title":      "Implement the signup flow",
		"details":    "Build the code path and tests.",
		"owner":      "eng",
		"created_by": "human",
		"project_id": project.ID,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("create project task status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	if gotProjectID != project.ID {
		t.Fatalf("prepareProjectTaskWorktree projectID = %q, want %q", gotProjectID, project.ID)
	}
	if gotRepoURL != "git@github.com:LAF-labs/agent-lab.git" {
		t.Fatalf("prepareProjectTaskWorktree repoURL = %q", gotRepoURL)
	}
	if gotTaskID == "" {
		t.Fatal("expected task ID to be passed to project worktree preparation")
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
