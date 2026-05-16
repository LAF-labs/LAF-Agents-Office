import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createExecutionPlan,
  createProject,
  createProjectLocalBinding,
  createRunnerPairing,
  createTask,
  deleteProjectLocalBinding,
  get,
  getBridgeAvailability,
  getExecutionPlan,
  getExecutionPlanEvents,
  getProjectLocalBindings,
  getProjectRepoReadiness,
  getRunnerStatus,
  initApi,
  login,
  resetWorkspace,
  revokeRunner,
  shredWorkspace,
  signup,
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
            setup:
              "PATH=\"$HOME/.local/bin:$PATH\"; if ! command -v laf-runner >/dev/null 2>&1; then curl -fsSL https://raw.githubusercontent.com/LAF-labs/LAF-Agents-Office/main/scripts/install.sh | LAF_OFFICE_INSTALL_BINARY=laf-runner sh || exit 1; fi; LAF_RUNNER_BIN=\"$(command -v laf-runner || printf '%s/.local/bin/laf-runner' \"$HOME\")\"; \"$LAF_RUNNER_BIN\" pair --api-url 'https://office.test/api' --code 'ABCD-1234-EF56' --background",
            connect:
              "laf-runner pair --api-url 'https://office.test/api' --code 'ABCD-1234-EF56' --background",
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
    expect(result.commands.connect).toContain("--background");
    expect(result.commands.setup).toContain(
      "LAF_OFFICE_INSTALL_BINARY=laf-runner",
    );
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

  it("sends the typed confirmation phrase with workspace wipes", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await resetWorkspace("i can spell responsibility");
    await shredWorkspace("i can spell responsibility");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspace/reset",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ confirm: "i can spell responsibility" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspace/shred",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ confirm: "i can spell responsibility" }),
      }),
    );
  });
});

describe("desktop bridge api client", () => {
  it("fetches bridge availability and project bindings", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/bridge/availability") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              devices: [{ id: "device-1", status: "online" }],
              my_bridge: { available: true, default_device_id: "device-1" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            bindings: [
              {
                id: "binding-1",
                device_id: "device-1",
                display_name: "Local checkout",
                trusted: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const availability = await getBridgeAvailability();
    const bindings = await getProjectLocalBindings("customer-portal");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/bridge/availability",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/customer-portal/local-bindings",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(availability.my_bridge.available).toBe(true);
    expect(bindings.bindings[0]?.id).toBe("binding-1");
  });

  it("creates and deletes a trusted project binding", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            binding: {
              id: "binding-1",
              device_id: "device-1",
              display_name: "Local checkout",
              trusted: true,
            },
            deleted: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createProjectLocalBinding("customer-portal", {
      device_id: "device-1",
      display_name: "Local checkout",
      local_path: "/Users/me/customer-portal",
      trusted: true,
    });
    await deleteProjectLocalBinding("customer-portal", "binding-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/customer-portal/local-bindings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          device_id: "device-1",
          display_name: "Local checkout",
          local_path: "/Users/me/customer-portal",
          trusted: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/customer-portal/local-bindings/binding-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates an execution plan and reads receipt-aware execution state", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/execution/plans" && init?.method === "POST") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                plan: { id: "plan-1", status: "pending" },
                relay: { published: false },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url === "/api/execution/plans/plan-1/events") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                events: [{ id: "event-1", event_type: "provider.output" }],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              plan: { id: "plan-1", status: "completed" },
              receipt: {
                id: "receipt-1",
                status: "completed",
                summary: "Done",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const created = await createExecutionPlan({
      binding_id: "binding-1",
      device_id: "device-1",
      message: "Implement signup",
      mode: "my_bridge",
      task_id: "task-1",
    });
    const state = await getExecutionPlan("plan-1");
    const events = await getExecutionPlanEvents("plan-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/execution/plans",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          binding_id: "binding-1",
          device_id: "device-1",
          message: "Implement signup",
          mode: "my_bridge",
          task_id: "task-1",
        }),
      }),
    );
    expect(created.relay?.published).toBe(false);
    expect(state.receipt?.summary).toBe("Done");
    expect(events.events[0]?.event_type).toBe("provider.output");
  });
});

describe("task and session api client", () => {
  it("omits nullish query params without stringifying undefined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await get("/example", {
      q: "customer portal",
      include_done: false,
      limit: 0,
      project_id: undefined,
      channel: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/example?q=customer%20portal&include_done=false&limit=0",
      expect.objectContaining({
        credentials: "include",
      }),
    );
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

  it("keeps same-origin proxy mode when hosted /api-token falls through to index.html", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<!doctype html><html></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("invalid credentials", { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();

    await expect(
      login({ email: "nobody@example.com", password: "wrongpassword" }),
    ).rejects.toThrow("invalid credentials");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("unwraps JSON API errors before showing them to auth forms", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid login credentials" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      login({ email: "nobody@example.com", password: "wrongpassword" }),
    ).rejects.toThrow("Invalid login credentials");
  });

  it("unwraps JSON signup errors before showing them to auth forms", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Unable to validate email address: invalid format",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      signup({
        email: "not-an-email",
        name: "Test User",
        password: "fake-password-for-test",
        team_action: "create",
        team_name: "Test Team",
      }),
    ).rejects.toThrow("Unable to validate email address: invalid format");
  });
});
