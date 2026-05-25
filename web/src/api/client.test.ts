import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProject,
  createTask,
  get,
  getProjectRepoReadiness,
  getTasks,
  hostedAPIBaseURL,
  hostedAPIURLFromBrowser,
  initApi,
  login,
  normalizeHostedAPIBase,
  normalizeModelMode,
  resetWorkspace,
  shredWorkspace,
  signup,
  sseURL,
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

describe("cloud-only api client surface", () => {
  it("does not expose obsolete execution or project binding helpers", async () => {
    const client = await import("./client");
    expect("getProjectLocalBindings" in client).toBe(false);
    expect("createProjectLocalBinding" in client).toBe(false);
    expect("deleteProjectLocalBinding" in client).toBe(false);
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

  it("normalizes unknown task model modes to record-only at the client boundary", async () => {
    expect(normalizeModelMode("legacy_cli")).toBe("record_only");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tasks: [
            {
              id: "task-1",
              model_mode: "legacy_cli",
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
      "record_only",
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
  it("uses hosted /api directly without discovery", async () => {
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

  it("supports a configured cross-origin hosted API base", async () => {
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

  it("keeps same-origin cloud API mode when auth fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("invalid credentials", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await initApi();

    await expect(
      login({ email: "nobody@example.com", password: "wrongpassword" }),
    ).rejects.toThrow("invalid credentials");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
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
