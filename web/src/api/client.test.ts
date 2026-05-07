import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProject,
  createTask,
  getProjectRepoReadiness,
  initApi,
  login,
  updateProject,
  updateTask,
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
            lead_agent: "founding-engineer",
            github_repo_url: "https://github.com/laf-labs/customer-portal",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createProject({
      name: "Customer Portal",
      lead_agent: "founding-engineer",
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
          lead_agent: "founding-engineer",
          github_repo_url: "https://github.com/laf-labs/customer-portal",
        }),
      }),
    );
    expect(result.project.lead_agent).toBe("founding-engineer");
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
            lead_agent: "pm",
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
      description: "Investor-ready customer portal.",
      additional_info: "Use this for board-demo context.",
      lead_agent: "pm",
      github_repo_url: "https://github.com/laf-labs/customer-portal",
      recipe_filename: "customer-portal-recipe.md",
      recipe_markdown: "## Rules\n\n- Keep demos crisp.\n",
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
          description: "Investor-ready customer portal.",
          additional_info: "Use this for board-demo context.",
          lead_agent: "pm",
          github_repo_url: "https://github.com/laf-labs/customer-portal",
          recipe_filename: "customer-portal-recipe.md",
          recipe_markdown: "## Rules\n\n- Keep demos crisp.\n",
        }),
      }),
    );
    expect(result.project.lead_agent).toBe("pm");
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

  it("updates a project task without changing its workflow state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          task: {
            id: "task-1",
            title: "Updated signup",
            details: "Tighter detail.",
            human_details: "Tighter detail.",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateTask({
      id: "task-1",
      channel: "general",
      title: "Updated signup",
      details: "Tighter detail.",
      human_details: "Tighter detail.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "update",
          created_by: "human",
          id: "task-1",
          channel: "general",
          title: "Updated signup",
          details: "Tighter detail.",
          human_details: "Tighter detail.",
        }),
      }),
    );
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

  it("keeps same-origin proxy mode when the dev proxy is temporarily unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(
        new Response("invalid credentials", { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();

    await expect(
      login({ email: "nobody@example.com", password: "wrongpassword" }),
    ).rejects.toThrow("invalid credentials");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });
});
