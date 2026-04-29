import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProject,
  createTask,
  getProjectRepoReadiness,
  updateProject,
} from "./client";

describe("project api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an optional GitHub repo URL when creating a project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: {
            id: "customer-portal",
            name: "Customer Portal",
            github_repo_url: "https://github.com/laf-labs/customer-portal",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createProject({
      name: "Customer Portal",
      github_repo_url: "https://github.com/laf-labs/customer-portal",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "create",
          created_by: "human",
          name: "Customer Portal",
          github_repo_url: "https://github.com/laf-labs/customer-portal",
        }),
      }),
    );
    expect(result.project.github_repo_url).toBe(
      "https://github.com/laf-labs/customer-portal",
    );
  });

  it("updates a project GitHub repo URL without making it a team-wide setting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: {
            id: "customer-portal",
            name: "Customer Portal",
            github_repo_url: "https://github.com/laf-labs/customer-portal",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateProject({
      id: "customer-portal",
      name: "Customer Portal",
      github_repo_url: "https://github.com/laf-labs/customer-portal",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "update",
          created_by: "human",
          id: "customer-portal",
          name: "Customer Portal",
          github_repo_url: "https://github.com/laf-labs/customer-portal",
        }),
      }),
    );
    expect(result.project.github_repo_url).toBe(
      "https://github.com/laf-labs/customer-portal",
    );
  });

  it("creates a project-scoped task with explicit execution context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          task: {
            id: "task-1",
            title: "Implement signup",
            project_id: "customer-portal",
            owner: "eng",
            execution_mode: "local_worktree",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTask({
      title: "Implement signup",
      details: "Build the code path and tests.",
      project_id: "customer-portal",
      channel: "general",
      owner: "eng",
      task_type: "feature",
      execution_mode: "local_worktree",
      created_by: "human",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "create",
          created_by: "human",
          title: "Implement signup",
          details: "Build the code path and tests.",
          project_id: "customer-portal",
          channel: "general",
          owner: "eng",
          task_type: "feature",
          execution_mode: "local_worktree",
        }),
      }),
    );
    expect(result.task.project_id).toBe("customer-portal");
  });

  it("checks project-scoped GitHub readiness without using a team-wide repo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          readiness: {
            project_id: "customer-portal",
            repo_url: "https://github.com/laf-labs/customer-portal",
            status: "ready",
            message: "GitHub CLI can access this repository.",
            can_create_coding_tasks: true,
            default_branch: "main",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getProjectRepoReadiness("customer-portal");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/repo-readiness?id=customer-portal&viewer_slug=human",
      expect.objectContaining({
        credentials: "include",
      }),
    );
    expect(result.readiness.can_create_coding_tasks).toBe(true);
    expect(result.readiness.default_branch).toBe("main");
  });
});
