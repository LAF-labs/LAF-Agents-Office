import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProject,
  createRunnerPairing,
  createTask,
  getProjectRepoReadiness,
  getRunnerStatus,
  initApi,
  login,
  revokeRunner,
  updateProject,
  updateTask,
} from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("project api client", () => {
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
});

describe("runner api client", () => {
  it("fetches runner status scoped to a project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jobs: [{ id: "runner-job-1", project_id: "customer-portal" }],
          runners: [{ id: "runner-local", status: "connected" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getRunnerStatus({ projectId: "customer-portal" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runner/status?project_id=customer-portal",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result.runners[0]?.status).toBe("connected");
  });

  it("creates a runner pairing code with the browser API URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          api_url: "https://office.test/api",
          commands: {
            connect:
              "laf-runner pair --api-url https://office.test/api --code ABCD-1234-EF56 --connect",
          },
          pairing: {
            code: "ABCD-1234-EF56",
            expires_at: "2026-05-10T12:10:00.000Z",
            team_id: "team-1",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRunnerPairing("https://office.test/api");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runner/pairing/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ api_url: "https://office.test/api" }),
      }),
    );
    expect(result.pairing.code).toBe("ABCD-1234-EF56");
    expect(result.commands.connect).toContain("--connect");
  });

  it("revokes a runner by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          runner: { id: "runner-local", status: "revoked" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await revokeRunner("runner-local");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/runner/revoke",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ runner_id: "runner-local" }),
      }),
    );
    expect(result.runner.status).toBe("revoked");
  });
});

describe("task and session api client", () => {
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
