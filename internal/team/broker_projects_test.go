package team

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

func TestProjectRepoReadinessReportsNotConnected(t *testing.T) {
	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":       "Planning Only",
		"created_by": "human",
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/projects/repo-readiness?id="+project.ID+"&viewer_slug=human", nil)
	b.handleProjectRepoReadiness(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("repo readiness status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Readiness projectRepoReadiness `json:"readiness"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode readiness: %v", err)
	}
	if body.Readiness.Status != "not_connected" || body.Readiness.CanCreateCodingTasks {
		t.Fatalf("unexpected readiness: %+v", body.Readiness)
	}
}

func TestProjectRepoReadinessRequiresGitHubAuth(t *testing.T) {
	oldLookPath := projectRepoLookPath
	oldRunGH := projectRepoRunGH
	t.Cleanup(func() {
		projectRepoLookPath = oldLookPath
		projectRepoRunGH = oldRunGH
	})
	projectRepoLookPath = func(file string) (string, error) {
		return "/usr/local/bin/gh", nil
	}
	projectRepoRunGH = func(args ...string) ([]byte, error) {
		if strings.Join(args, " ") == "auth status" {
			return nil, errors.New("not logged in")
		}
		t.Fatalf("unexpected gh call before auth succeeds: %v", args)
		return nil, nil
	}

	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "https://github.com/laf-labs/agent-lab",
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/projects/repo-readiness?id="+project.ID+"&viewer_slug=human", nil)
	b.handleProjectRepoReadiness(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("repo readiness status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Readiness projectRepoReadiness `json:"readiness"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode readiness: %v", err)
	}
	if body.Readiness.Status != "auth_required" || body.Readiness.CanCreateCodingTasks {
		t.Fatalf("unexpected readiness: %+v", body.Readiness)
	}
}

func TestProjectRepoReadinessReadyIncludesDefaultBranch(t *testing.T) {
	oldLookPath := projectRepoLookPath
	oldRunGH := projectRepoRunGH
	t.Cleanup(func() {
		projectRepoLookPath = oldLookPath
		projectRepoRunGH = oldRunGH
	})
	projectRepoLookPath = func(file string) (string, error) {
		return "/usr/local/bin/gh", nil
	}
	projectRepoRunGH = func(args ...string) ([]byte, error) {
		switch strings.Join(args, " ") {
		case "auth status":
			return []byte("Logged in\n"), nil
		case "repo view laf-labs/agent-lab --json defaultBranchRef --jq .defaultBranchRef.name":
			return []byte("main\n"), nil
		default:
			t.Fatalf("unexpected gh call: %v", args)
			return nil, nil
		}
	}

	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "git@github.com:laf-labs/agent-lab.git",
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/projects/repo-readiness?id="+project.ID+"&viewer_slug=human", nil)
	b.handleProjectRepoReadiness(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("repo readiness status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Readiness projectRepoReadiness `json:"readiness"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode readiness: %v", err)
	}
	if body.Readiness.Status != "ready" || !body.Readiness.CanCreateCodingTasks {
		t.Fatalf("unexpected readiness: %+v", body.Readiness)
	}
	if body.Readiness.DefaultBranch != "main" {
		t.Fatalf("default branch = %q, want main", body.Readiness.DefaultBranch)
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
		"Before work: read this page or the project memory excerpt in the task packet.",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("project wiki missing %q in:\n%s", want, content)
		}
	}
	if strings.Contains(content, "TODO:") {
		t.Fatalf("project wiki should not ship TODO placeholders:\n%s", content)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/wiki/article?path=team/projects/"+project.ID+".md", nil)
	b.handleWikiArticle(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("wiki article status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestProjectWikiArticleGetMaterializesMissingArticle(t *testing.T) {
	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":       "Delayed Wiki",
		"created_by": "human",
	})

	root := filepath.Join(t.TempDir(), "wiki")
	backup := filepath.Join(t.TempDir(), "wiki.bak")
	repo := NewRepoAt(root, backup)
	if err := repo.Init(context.Background()); err != nil {
		t.Fatalf("init wiki repo: %v", err)
	}
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

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/wiki/article?path=team/projects/"+project.ID+".md", nil)
	b.handleWikiArticle(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("wiki article status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Path    string `json:"path"`
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode article: %v", err)
	}
	if body.Path != "team/projects/"+project.ID+".md" {
		t.Fatalf("article path = %q", body.Path)
	}
	if !strings.Contains(body.Content, "Project ID: `"+project.ID+"`") {
		t.Fatalf("materialized article missing project snapshot:\n%s", body.Content)
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

func TestProjectTaskLifecycleAppendsToProjectWiki(t *testing.T) {
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

	createRec := httptest.NewRecorder()
	b.handlePostTask(createRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":         "create",
		"title":          "Implement the signup flow",
		"owner":          "eng",
		"created_by":     "human",
		"project_id":     project.ID,
		"execution_mode": "office",
	}))
	if createRec.Code != http.StatusOK {
		t.Fatalf("create project task status = %d, want %d: %s", createRec.Code, http.StatusOK, createRec.Body.String())
	}
	var created struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode task: %v", err)
	}

	reviewRec := httptest.NewRecorder()
	b.handlePostTask(reviewRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "review",
		"id":         created.Task.ID,
		"created_by": "human",
	}))
	if reviewRec.Code != http.StatusOK {
		t.Fatalf("review project task status = %d, want %d: %s", reviewRec.Code, http.StatusOK, reviewRec.Body.String())
	}
	worker.WaitForIdle()

	raw, err := os.ReadFile(filepath.Join(root, "team", "projects", project.ID+".md"))
	if err != nil {
		t.Fatalf("read project wiki: %v", err)
	}
	content := string(raw)
	for _, want := range []string{
		"Task `" + created.Task.ID + "` created: Implement the signup flow",
		"Task `" + created.Task.ID + "` updated: Implement the signup flow",
		"status `review`",
		"owner `@eng`",
		"mode `office`",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("project wiki missing %q in:\n%s", want, content)
		}
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

func TestProjectCodingTaskAutoCreatesPullRequestReceipt(t *testing.T) {
	oldProjectPrepare := prepareProjectTaskWorktree
	oldRunGit := projectTaskRunGit
	oldRunGH := projectTaskRunGH
	t.Cleanup(func() {
		prepareProjectTaskWorktree = oldProjectPrepare
		projectTaskRunGit = oldRunGit
		projectTaskRunGH = oldRunGH
	})
	prepareProjectTaskWorktree = func(projectID, repoURL, taskID string) (string, string, error) {
		return "/tmp/laf-office-task-project-task", "laf-office-project-task", nil
	}
	var gitCalls []string
	projectTaskRunGit = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		gitCalls = append(gitCalls, strings.Join(args, " "))
		switch strings.Join(args, " ") {
		case "push -u origin laf-office-project-task":
			return []byte("pushed\n"), nil
		case "symbolic-ref --short refs/remotes/origin/HEAD":
			return []byte("origin/main\n"), nil
		default:
			t.Fatalf("unexpected git call in %s: %v", dir, args)
			return nil, nil
		}
	}
	projectTaskRunGH = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		if got, want := strings.Join(args, " "), "pr create --title Implement the signup flow --body Task: #task-1\n\nBuild the code path and tests.\n\nCreated by LAF-Office project task delivery. --head laf-office-project-task --base main"; got != want {
			t.Fatalf("unexpected gh call in %s:\n got: %q\nwant: %q", dir, got, want)
		}
		return []byte("https://github.com/LAF-labs/agent-lab/pull/7\n"), nil
	}

	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "git@github.com:LAF-labs/agent-lab.git",
	})
	task := createProjectCodingTaskForTest(t, b, project.ID)

	reviewRec := httptest.NewRecorder()
	b.handlePostTask(reviewRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "review",
		"id":         task.ID,
		"created_by": "human",
	}))
	if reviewRec.Code != http.StatusOK {
		t.Fatalf("review project coding task status = %d, want %d: %s", reviewRec.Code, http.StatusOK, reviewRec.Body.String())
	}
	var delivered struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(reviewRec.Body).Decode(&delivered); err != nil {
		t.Fatalf("decode delivered task: %v", err)
	}
	if delivered.Task.Status != taskStatusReview {
		t.Fatalf("review should keep structured task in review, got %+v", delivered.Task)
	}
	if delivered.Task.DeliveryURL != "https://github.com/LAF-labs/agent-lab/pull/7" {
		t.Fatalf("delivery_url = %q", delivered.Task.DeliveryURL)
	}
	if !strings.Contains(delivered.Task.DeliverySummary, "Opened PR for Implement the signup flow") {
		t.Fatalf("delivery_summary = %q", delivered.Task.DeliverySummary)
	}
	if strings.Join(gitCalls, "\n") != "push -u origin laf-office-project-task\nsymbolic-ref --short refs/remotes/origin/HEAD" {
		t.Fatalf("unexpected git calls: %v", gitCalls)
	}

	doneRec := httptest.NewRecorder()
	b.handlePostTask(doneRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "complete",
		"id":         task.ID,
		"created_by": "human",
	}))
	if doneRec.Code != http.StatusOK {
		t.Fatalf("complete delivered task status = %d, want %d: %s", doneRec.Code, http.StatusOK, doneRec.Body.String())
	}
	var done struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(doneRec.Body).Decode(&done); err != nil {
		t.Fatalf("decode done task: %v", err)
	}
	if done.Task.Status != taskStatusDone || done.Task.DeliveryURL != delivered.Task.DeliveryURL {
		t.Fatalf("expected delivered task to close cleanly, got %+v", done.Task)
	}
}

func TestProjectCodingTaskAutoPullRequestFailureBlocksAndWritesWiki(t *testing.T) {
	oldProjectPrepare := prepareProjectTaskWorktree
	oldRunGit := projectTaskRunGit
	oldRunGH := projectTaskRunGH
	t.Cleanup(func() {
		prepareProjectTaskWorktree = oldProjectPrepare
		projectTaskRunGit = oldRunGit
		projectTaskRunGH = oldRunGH
	})
	prepareProjectTaskWorktree = func(projectID, repoURL, taskID string) (string, string, error) {
		return "/tmp/laf-office-task-project-task", "laf-office-project-task", nil
	}
	projectTaskRunGit = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		return nil, errors.New("push rejected")
	}
	projectTaskRunGH = func(ctx context.Context, dir string, args ...string) ([]byte, error) {
		t.Fatalf("gh should not run when branch push fails: %v", args)
		return nil, nil
	}

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
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "git@github.com:LAF-labs/agent-lab.git",
	})
	worker.WaitForIdle()
	task := createProjectCodingTaskForTest(t, b, project.ID)

	doneRec := httptest.NewRecorder()
	b.handlePostTask(doneRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "complete",
		"id":         task.ID,
		"created_by": "human",
	}))
	if doneRec.Code != http.StatusOK {
		t.Fatalf("auto PR failure status = %d, want %d: %s", doneRec.Code, http.StatusOK, doneRec.Body.String())
	}
	var blocked struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(doneRec.Body).Decode(&blocked); err != nil {
		t.Fatalf("decode blocked task: %v", err)
	}
	if blocked.Task.Status != taskStatusBlocked || !blocked.Task.Blocked {
		t.Fatalf("expected blocked task after PR failure, got %+v", blocked.Task)
	}
	if !strings.Contains(blocked.Task.Details, "PR delivery failed: push rejected") {
		t.Fatalf("expected PR failure detail, got %q", blocked.Task.Details)
	}
	worker.WaitForIdle()
	raw, err := os.ReadFile(filepath.Join(root, "team", "projects", project.ID+".md"))
	if err != nil {
		t.Fatalf("read project wiki: %v", err)
	}
	content := string(raw)
	for _, want := range []string{
		"Task `" + task.ID + "` updated: Implement the signup flow",
		"status `blocked`",
		"PR delivery failed: push rejected",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("project wiki missing %q in:\n%s", want, content)
		}
	}
}

func TestProjectCodingTaskStoresDeliveryReceiptAndWritesWiki(t *testing.T) {
	oldProjectPrepare := prepareProjectTaskWorktree
	t.Cleanup(func() {
		prepareProjectTaskWorktree = oldProjectPrepare
	})
	prepareProjectTaskWorktree = func(projectID, repoURL, taskID string) (string, string, error) {
		return "/tmp/laf-office-task-project-task", "laf-office-project-task", nil
	}

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
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "git@github.com:LAF-labs/agent-lab.git",
	})
	worker.WaitForIdle()
	task := createProjectCodingTaskForTest(t, b, project.ID)

	doneRec := httptest.NewRecorder()
	b.handlePostTask(doneRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":           "complete",
		"id":               task.ID,
		"created_by":       "human",
		"delivery_url":     "https://github.com/LAF-labs/agent-lab/pull/42",
		"delivery_summary": "Implemented signup form validation.",
	}))
	if doneRec.Code != http.StatusOK {
		t.Fatalf("complete with delivery URL status = %d, want %d: %s", doneRec.Code, http.StatusOK, doneRec.Body.String())
	}
	var done struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(doneRec.Body).Decode(&done); err != nil {
		t.Fatalf("decode done task: %v", err)
	}
	if done.Task.Status != taskStatusReview {
		t.Fatalf("first complete should move structured task to review, got %q", done.Task.Status)
	}
	if done.Task.DeliveryURL != "https://github.com/LAF-labs/agent-lab/pull/42" {
		t.Fatalf("delivery_url = %q", done.Task.DeliveryURL)
	}
	if done.Task.DeliverySummary != "Implemented signup form validation." {
		t.Fatalf("delivery_summary = %q", done.Task.DeliverySummary)
	}
	if strings.TrimSpace(done.Task.DeliveredAt) == "" {
		t.Fatal("expected delivered_at to be set")
	}

	approveRec := httptest.NewRecorder()
	b.handlePostTask(approveRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "complete",
		"id":         task.ID,
		"created_by": "human",
	}))
	if approveRec.Code != http.StatusOK {
		t.Fatalf("complete delivered task status = %d, want %d: %s", approveRec.Code, http.StatusOK, approveRec.Body.String())
	}
	var approved struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(approveRec.Body).Decode(&approved); err != nil {
		t.Fatalf("decode approved task: %v", err)
	}
	if approved.Task.Status != taskStatusDone {
		t.Fatalf("delivered task status = %q, want %q", approved.Task.Status, taskStatusDone)
	}
	if approved.Task.DeliveryURL != done.Task.DeliveryURL {
		t.Fatalf("delivery_url was not preserved on completion: %q", approved.Task.DeliveryURL)
	}
	worker.WaitForIdle()

	raw, err := os.ReadFile(filepath.Join(root, "team", "projects", project.ID+".md"))
	if err != nil {
		t.Fatalf("read project wiki: %v", err)
	}
	content := string(raw)
	for _, want := range []string{
		"delivery `https://github.com/LAF-labs/agent-lab/pull/42`",
		"Delivery: Implemented signup form validation.",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("project wiki missing delivery receipt %q in:\n%s", want, content)
		}
	}
}

func TestLocalProductLoopProjectWikiPacketAndDelivery(t *testing.T) {
	oldProjectPrepare := prepareProjectTaskWorktree
	t.Cleanup(func() {
		prepareProjectTaskWorktree = oldProjectPrepare
	})
	prepareProjectTaskWorktree = func(projectID, repoURL, taskID string) (string, string, error) {
		return "/tmp/laf-office-" + projectID + "-" + taskID, "laf-office-" + taskID, nil
	}

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

	signup := signupForTest(t, b, "founder@example.com", "Founder", "create", "Founder Team", "")
	if signup.Team.ID == "" || signup.User.ID == "" {
		t.Fatalf("signup did not create team/user: %+v", signup)
	}

	project := createProjectForTest(t, b, map[string]string{
		"name":            "Customer Portal",
		"description":     "Ship the first customer onboarding loop.",
		"created_by":      "human",
		"github_repo_url": "https://github.com/laf-labs/customer-portal",
	})
	worker.WaitForIdle()

	createRec := httptest.NewRecorder()
	b.handlePostTask(createRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "create",
		"title":      "Implement signup validation",
		"details":    "Add validation and tests.",
		"owner":      "eng",
		"created_by": "human",
		"project_id": project.ID,
	}))
	if createRec.Code != http.StatusOK {
		t.Fatalf("create project coding task status = %d, want %d: %s", createRec.Code, http.StatusOK, createRec.Body.String())
	}
	var created struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(createRec.Body).Decode(&created); err != nil {
		t.Fatalf("decode created task: %v", err)
	}
	if created.Task.ExecutionMode != executionModeLocalWorktree || created.Task.WorktreeBranch == "" {
		t.Fatalf("expected local worktree coding task, got %+v", created.Task)
	}

	packet := (&Launcher{broker: b}).buildTaskExecutionPacket("eng", officeActionLog{
		Kind:  "task_created",
		Actor: "human",
	}, created.Task, "Start the implementation.")
	for _, want := range []string{
		"- Project wiki: team/projects/" + project.ID + ".md",
		"Project memory excerpt (read before work):",
		"Ship the first customer onboarding loop.",
		"Project repo rule: use this project repo as the coding boundary",
		"Project delivery rule: commit changes on branch",
	} {
		if !strings.Contains(packet, want) {
			t.Fatalf("packet missing %q:\n%s", want, packet)
		}
	}

	reviewRec := httptest.NewRecorder()
	b.handlePostTask(reviewRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":           "complete",
		"id":               created.Task.ID,
		"created_by":       "human",
		"delivery_url":     "https://github.com/laf-labs/customer-portal/pull/7",
		"delivery_summary": "Implemented signup validation.",
	}))
	if reviewRec.Code != http.StatusOK {
		t.Fatalf("deliver task status = %d, want %d: %s", reviewRec.Code, http.StatusOK, reviewRec.Body.String())
	}
	var delivered struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(reviewRec.Body).Decode(&delivered); err != nil {
		t.Fatalf("decode delivered task: %v", err)
	}
	if delivered.Task.Status != taskStatusReview || delivered.Task.DeliveryURL == "" {
		t.Fatalf("expected delivered task in review, got %+v", delivered.Task)
	}

	doneRec := httptest.NewRecorder()
	b.handlePostTask(doneRec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "complete",
		"id":         created.Task.ID,
		"created_by": "human",
	}))
	if doneRec.Code != http.StatusOK {
		t.Fatalf("approve delivered task status = %d, want %d: %s", doneRec.Code, http.StatusOK, doneRec.Body.String())
	}
	var done struct {
		Task teamTask `json:"task"`
	}
	if err := json.NewDecoder(doneRec.Body).Decode(&done); err != nil {
		t.Fatalf("decode done task: %v", err)
	}
	if done.Task.Status != taskStatusDone {
		t.Fatalf("expected done task, got %+v", done.Task)
	}
	worker.WaitForIdle()

	raw, err := os.ReadFile(filepath.Join(root, "team", "projects", project.ID+".md"))
	if err != nil {
		t.Fatalf("read project wiki: %v", err)
	}
	content := string(raw)
	for _, want := range []string{
		"Project ID: `customer-portal`",
		"Task `" + created.Task.ID + "` created: Implement signup validation",
		"delivery `https://github.com/laf-labs/customer-portal/pull/7`",
		"Delivery: Implemented signup validation.",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("project wiki missing %q in:\n%s", want, content)
		}
	}
}

func TestFailedProjectCodingTaskUpdateDoesNotStoreDeliveryReceipt(t *testing.T) {
	oldProjectPrepare := prepareProjectTaskWorktree
	t.Cleanup(func() {
		prepareProjectTaskWorktree = oldProjectPrepare
	})
	prepareProjectTaskWorktree = func(projectID, repoURL, taskID string) (string, string, error) {
		return "/tmp/laf-office-task-project-task", "laf-office-project-task", nil
	}

	b := newTestBroker(t)
	project := createProjectForTest(t, b, map[string]string{
		"name":            "Agent Lab",
		"created_by":      "human",
		"github_repo_url": "git@github.com:LAF-labs/agent-lab.git",
	})
	task := createProjectCodingTaskForTest(t, b, project.ID)

	rec := httptest.NewRecorder()
	b.handlePostTask(rec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":           "not-a-real-action",
		"id":               task.ID,
		"created_by":       "human",
		"delivery_url":     "https://github.com/LAF-labs/agent-lab/pull/99",
		"delivery_summary": "This should not be stored.",
	}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid update status = %d, want %d: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}

	b.mu.Lock()
	defer b.mu.Unlock()
	var stored *teamTask
	for i := range b.tasks {
		if b.tasks[i].ID == task.ID {
			stored = &b.tasks[i]
			break
		}
	}
	if stored == nil {
		t.Fatal("expected task to remain stored")
	}
	if stored.DeliveryURL != "" || stored.DeliverySummary != "" || stored.DeliveredAt != "" {
		t.Fatalf("failed update stored delivery receipt: %#v", stored)
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

func createProjectCodingTaskForTest(t *testing.T, b *Broker, projectID string) teamTask {
	t.Helper()
	rec := httptest.NewRecorder()
	b.handlePostTask(rec, jsonRequestForTest(t, "/tasks", map[string]string{
		"action":     "create",
		"title":      "Implement the signup flow",
		"details":    "Build the code path and tests.",
		"owner":      "eng",
		"created_by": "human",
		"project_id": projectID,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("create project coding task status = %d, want %d: %s", rec.Code, http.StatusOK, rec.Body.String())
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
