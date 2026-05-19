import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createExecutionPlan,
  createProject,
  createTask,
  get,
  getBridgeAvailability,
  getExecutionPlan,
  getExecutionPlanEvents,
  getProjectRepoReadiness,
  getTasks,
  hostedAPIBaseURL,
  hostedAPIURLFromBrowser,
  initApi,
  isLocalhostRuntime,
  login,
  normalizeHostedAPIBase,
  normalizeModelMode,
  resetWorkspace,
  shredWorkspace,
  signup,
  sseURL,
  startBridgePairing,
  supportsBrokerEvents,
  updateProject,
  updateTask,
} from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("project api client", () => {
  it("sends an optional GitHub repo URL when creating a project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          project: {
            id: "customer-portal",
            code: "CUST",
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
      code: "CUST",
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
          code: "CUST",
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
            code: "CUST",
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
      code: "CUST",
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
          code: "CUST",
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

  it("creates a project-scoped task without browser-owned execution context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          task: {
            id: "task-1",
            title: "Implement signup",
            project_id: "customer-portal",
            owner: "eng",
            execution_mode: "managed_checkout",
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
        }),
      }),
    );
    expect(result.task.project_id).toBe("customer-portal");
  });
});

describe("workspace destructive api client", () => {
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

describe("LAF Bridge api client", () => {
  it("fetches bridge availability without project binding calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          devices: [{ id: "device-1", status: "online" }],
          my_bridge: { available: true, default_device_id: "device-1" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const availability = await getBridgeAvailability();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bridge/availability",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(availability.my_bridge.available).toBe(true);
  });

  it("normalizes Bridge pairing responses to the public pair-only surface", async () => {
    const publicPairCommand = "npx laf-bridge pair";
    const apiURLFlag = "--api-url";
    const codeFlag = "--code";
    const rawSetupCode = ["RAW", "CODE"].join("-");
    const startCommand = ["laf-bridge", "start"].join(" ");
    const statusCommand = ["laf-bridge", "status"].join(" ");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          api_url: "https://office.example.com/api",
          commands: {
            pair: [
              publicPairCommand,
              apiURLFlag,
              "https://office.example.com/api",
              codeFlag,
              "SECRET",
            ].join(" "),
            setup: [publicPairCommand, codeFlag, rawSetupCode].join(" "),
            start: startCommand,
            status: statusCommand,
          },
          pairing: {
            code: rawSetupCode,
            expires_at: "2030-01-01T00:00:00Z",
            setup_code: "SETUP-CODE",
            team_id: "team-1",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await startBridgePairing({
      api_url: "https://office.example.com/api",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bridge/pairing/start",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ api_url: "https://office.example.com/api" }),
      }),
    );
    expect(result.commands).toEqual({ pair: "npx laf-bridge pair" });
    expect(result.pairing).toEqual({
      expires_at: "2030-01-01T00:00:00Z",
      setup_code: "SETUP-CODE",
      team_id: "team-1",
    });
    expect("code" in result.pairing).toBe(false);
    expect("start" in result.commands).toBe(false);
    expect("status" in result.commands).toBe(false);
  });

  it("does not expose project local binding helpers to the hosted web client", async () => {
    const client = await import("./client");
    expect("getProjectLocalBindings" in client).toBe(false);
    expect("createProjectLocalBinding" in client).toBe(false);
    expect("deleteProjectLocalBinding" in client).toBe(false);
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

describe("task api client", () => {
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

  it("normalizes legacy task model modes at the hosted API boundary", async () => {
    expect(normalizeModelMode("local_cli")).toBe("my_bridge");
    expect(normalizeModelMode("team_bridge")).toBe("my_bridge");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tasks: [
            {
              id: "task-1",
              model_mode: "local_cli",
              status: "todo",
              title: "Wire setup",
            },
            {
              id: "task-2",
              model_mode: "laf_model",
              status: "todo",
              title: "Draft plan",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTasks("general");

    expect(result.tasks.map((task) => task.model_mode)).toEqual([
      "my_bridge",
      "laf_model",
    ]);
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

describe("hosted browser api client", () => {
  it("uses hosted /api directly and skips local broker discovery off localhost", async () => {
    vi.stubGlobal("location", { hostname: "laf-co.com" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();
    await get("/auth/session");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api-token", expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("localhost:7890"),
      expect.anything(),
    );
    expect(supportsBrokerEvents()).toBe(false);
  });

  it("supports a configured cross-origin hosted API base without local broker discovery", async () => {
    vi.stubEnv("VITE_LAF_API_BASE_URL", "https://api.office.example/api/");
    vi.stubGlobal("location", {
      hostname: "app.office.example",
      origin: "https://app.office.example",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();
    await get("/auth/session");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.office.example/api/auth/session",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api-token", expect.anything());
    expect(hostedAPIBaseURL()).toBe("https://api.office.example/api");
    expect(hostedAPIURLFromBrowser()).toBe("https://api.office.example/api");
    expect(sseURL("/events")).toBe("https://api.office.example/api/events");
  });

  it("normalizes a bare browser API host for split-origin deployments", async () => {
    vi.stubEnv("VITE_LAF_API_BASE_URL", "api.office.example");
    vi.stubGlobal("location", {
      hostname: "app.office.example",
      origin: "https://app.office.example",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();
    await get("/auth/session");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.office.example/api/auth/session",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(hostedAPIBaseURL()).toBe("https://api.office.example/api");
  });

  it("normalizes hosted API base values for same-origin and split-origin deployments", () => {
    vi.stubGlobal("location", {
      hostname: "office.example",
      origin: "https://office.example",
    });

    expect(normalizeHostedAPIBase("")).toBe("/api");
    expect(normalizeHostedAPIBase("api/")).toBe("/api");
    expect(normalizeHostedAPIBase("/custom-api/")).toBe("/custom-api");
    expect(normalizeHostedAPIBase("api.office.example")).toBe(
      "https://api.office.example/api",
    );
    expect(normalizeHostedAPIBase("api.office.example/custom-api/")).toBe(
      "https://api.office.example/custom-api",
    );
    expect(normalizeHostedAPIBase("https://api.office.example")).toBe(
      "https://api.office.example/api",
    );
    expect(
      normalizeHostedAPIBase("https://api.office.example/api/?x=1#frag"),
    ).toBe("https://api.office.example/api");
    expect(hostedAPIURLFromBrowser()).toBe("https://office.example/api");
  });

  it("identifies localhost as the only browser broker-event runtime", () => {
    expect(isLocalhostRuntime("localhost")).toBe(true);
    expect(isLocalhostRuntime("127.0.0.1")).toBe(true);
    expect(isLocalhostRuntime("laf-co.com")).toBe(false);
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
});

describe("auth api client errors", () => {
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
